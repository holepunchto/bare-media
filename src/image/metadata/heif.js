import {
  encodeBox,
  parseBoxes,
  parseFullBox,
  readUInt,
  rewriteBox,
  rewriteAsZeroFilledBox,
  rewriteBoxes,
  rewriteFullBox,
  writeUInt,
  copyWithZeroedRanges
} from '../../container/isobmff'

const BOX_TYPE = {
  FREE: 'free',
  ITEM_DATA: 'idat',
  ITEM_INFO: 'iinf',
  ITEM_INFO_ENTRY: 'infe',
  ITEM_LOCATION: 'iloc',
  ITEM_PROPERTIES: 'iprp',
  ITEM_REFERENCE: 'iref',
  MEDIA_DATA: 'mdat',
  META: 'meta',
  PRIMARY_ITEM: 'pitm',
  PROPERTY_ASSOCIATION: 'ipma',
  SAMSUNG_METADATA: 'sefd'
}

const ITEM_TYPE = {
  EXIF: 'Exif',
  MIME: 'mime',
  URI: 'uri '
}

const SAMSUNG_SIGNATURE = {
  TRAILER: 'SEFT',
  DIRECTORY: 'SEFH'
}

const UINT8_BYTES = 1
const UINT16_BYTES = 2
const UINT32_BYTES = 4

const ITEM_INFO_VERSION_WITH_SHORT_ID = 2
const ITEM_INFO_VERSION_WITH_LONG_ID = 3
const ITEM_LOCATION_VERSION_WITH_LONG_ID = 2
const MAX_ITEM_REFERENCE_VERSION = 1
const MAX_PROPERTY_ASSOCIATION_VERSION = 1
const LARGE_PROPERTY_INDEX_FLAG = 1
const MAX_ITEM_EXTENTS = 4096
const MAX_ITEMS = 4096

const ITEM_TYPE_BYTES = 4
const ITEM_LOCATION_SIZE_BYTES = 2
const FULL_BOX_FIELDS_BYTES = 4
const FREE_BOX_HEADER_BYTES = 8

const SIZE_NIBBLE_SHIFT = 4
const SIZE_NIBBLE_MASK = 0x0f
const CONSTRUCTION_METHOD_MASK = 0x0f
const MAX_CONSTRUCTION_METHOD = 2
const FILE_OFFSET_CONSTRUCTION_METHOD = 0
const ITEM_DATA_CONSTRUCTION_METHOD = 1

const SAMSUNG_FOOTER_BYTES = 8
const SAMSUNG_SIGNATURE_BYTES = 4
const SAMSUNG_DIRECTORY_COUNT_OFFSET = 8
const SAMSUNG_DIRECTORY_HEADER_BYTES = 12
const SAMSUNG_DIRECTORY_ENTRY_BYTES = 12
const SAMSUNG_ITEM_HEADER_BYTES = 8

const METADATA_ITEM_TYPES = new Set([ITEM_TYPE.EXIF, ITEM_TYPE.MIME, ITEM_TYPE.URI])
const MIME_IMAGE_CONTENT_TYPE = 'image/jpeg'
const VENDOR_BOX_VALIDATORS = new Map([[BOX_TYPE.SAMSUNG_METADATA, validateSamsungBox]])

function readString(buffer, offset, end) {
  const nullIndex = buffer.indexOf(0, offset)
  if (nullIndex === -1 || nullIndex >= end) {
    throw new Error('Invalid HEIF item information string')
  }

  return {
    value: buffer.toString('utf8', offset, nullIndex),
    end: nullIndex + 1
  }
}

function itemInfoEntry(buffer, box) {
  if (box.type !== BOX_TYPE.ITEM_INFO_ENTRY) return null

  const fullBox = parseFullBox(buffer, box)
  if (
    fullBox.version !== ITEM_INFO_VERSION_WITH_SHORT_ID &&
    fullBox.version !== ITEM_INFO_VERSION_WITH_LONG_ID
  ) {
    return null
  }

  const idSize = fullBox.version === ITEM_INFO_VERSION_WITH_SHORT_ID ? UINT16_BYTES : UINT32_BYTES
  const typeOffset = fullBox.dataStart + idSize + UINT16_BYTES

  if (typeOffset + ITEM_TYPE_BYTES > box.end) {
    throw new Error('Invalid HEIF item information entry')
  }

  const type = buffer.toString('latin1', typeOffset, typeOffset + ITEM_TYPE_BYTES)
  const name = readString(buffer, typeOffset + ITEM_TYPE_BYTES, box.end)

  let contentType = null
  if (type === ITEM_TYPE.MIME) {
    contentType = readString(buffer, name.end, box.end).value
  }

  return {
    id: readUInt(buffer, fullBox.dataStart, idSize),
    type,
    contentType
  }
}

function isMetadataItem(item) {
  return (
    METADATA_ITEM_TYPES.has(item.type) &&
    !(item.type === ITEM_TYPE.MIME && item.contentType === MIME_IMAGE_CONTENT_TYPE)
  )
}

function parseItemInfo(buffer, box) {
  const fullBox = parseFullBox(buffer, box)
  const countSize = fullBox.version === 0 ? UINT16_BYTES : UINT32_BYTES
  const entriesStart = fullBox.dataStart + countSize

  if (entriesStart > box.end) {
    throw new Error('Invalid HEIF item information box')
  }

  return {
    ...fullBox,
    countSize,
    entries: parseBoxes(buffer, entriesStart, box.end)
  }
}

function rewriteItemInfo(buffer, box, info, metadataItemIds) {
  const entries = info.entries.filter((entry) => {
    const item = itemInfoEntry(buffer, entry)
    return !item || !metadataItemIds.has(item.id)
  })

  const count = readUInt(buffer, info.dataStart, info.countSize)
  const payload = Buffer.allocUnsafe(info.countSize)
  writeUInt(payload, count - (info.entries.length - entries.length), 0, info.countSize)

  return rewriteFullBox(
    box,
    info.version,
    info.flags,
    Buffer.concat([payload, ...entries.map((entry) => buffer.subarray(entry.start, entry.end))]),
    { extendsToEnd: false }
  )
}

function parseItemLocation(buffer, box) {
  const fullBox = parseFullBox(buffer, box)
  if (fullBox.version > ITEM_LOCATION_VERSION_WITH_LONG_ID) {
    throw new Error('Unsupported HEIF item location version')
  }

  let offset = fullBox.dataStart
  if (offset + ITEM_LOCATION_SIZE_BYTES > box.end) {
    throw new Error('Invalid HEIF item location box')
  }

  const sizes = buffer[offset++]
  const sizes2 = buffer[offset++]
  const offsetSize = sizes >> SIZE_NIBBLE_SHIFT
  const lengthSize = sizes & SIZE_NIBBLE_MASK
  const baseOffsetSize = sizes2 >> SIZE_NIBBLE_SHIFT
  const indexSize = fullBox.version > 0 ? sizes2 & SIZE_NIBBLE_MASK : 0
  const itemIdSize =
    fullBox.version < ITEM_LOCATION_VERSION_WITH_LONG_ID ? UINT16_BYTES : UINT32_BYTES
  const itemCountSize =
    fullBox.version < ITEM_LOCATION_VERSION_WITH_LONG_ID ? UINT16_BYTES : UINT32_BYTES
  const itemCount = readUInt(buffer, offset, itemCountSize)
  offset += itemCountSize
  if (itemCount > MAX_ITEMS) {
    throw new Error('Invalid HEIF item location box')
  }

  const items = []
  let totalExtents = 0
  const itemHeaderSize =
    itemIdSize +
    (fullBox.version > 0 ? UINT16_BYTES : 0) +
    UINT16_BYTES +
    baseOffsetSize +
    UINT16_BYTES
  const extentSize = indexSize + offsetSize + lengthSize

  for (let i = 0; i < itemCount; i++) {
    if (offset + itemHeaderSize > box.end) {
      throw new Error('Invalid HEIF item location box')
    }
    const start = offset
    const id = readUInt(buffer, offset, itemIdSize)
    offset += itemIdSize

    let constructionField = 0
    if (fullBox.version > 0) {
      constructionField = readUInt(buffer, offset, UINT16_BYTES)
      offset += UINT16_BYTES
    }

    const dataReferenceIndex = readUInt(buffer, offset, UINT16_BYTES)
    offset += UINT16_BYTES
    const baseOffset = readUInt(buffer, offset, baseOffsetSize)
    offset += baseOffsetSize
    const extentCount = readUInt(buffer, offset, UINT16_BYTES)
    offset += UINT16_BYTES
    totalExtents += extentCount
    if (totalExtents > MAX_ITEM_EXTENTS) {
      throw new Error('Invalid HEIF item location box')
    }
    if ((lengthSize === 0 && extentCount > 1) || extentCount * extentSize > box.end - offset) {
      throw new Error('Invalid HEIF item location box')
    }

    const extents = []
    for (let j = 0; j < extentCount; j++) {
      if (fullBox.version > 0 && indexSize > 0) {
        readUInt(buffer, offset, indexSize)
        offset += indexSize
      }

      const extentOffset = readUInt(buffer, offset, offsetSize)
      offset += offsetSize
      const length = readUInt(buffer, offset, lengthSize)
      offset += lengthSize
      extents.push({ offset: extentOffset, length })
    }

    items.push({
      id,
      start,
      end: offset,
      constructionMethod: constructionField & CONSTRUCTION_METHOD_MASK,
      dataReferenceIndex,
      baseOffset,
      extents
    })
  }

  if (offset !== box.end) throw new Error('Invalid HEIF item location box')

  return {
    ...fullBox,
    itemCountSize,
    items
  }
}

function rewriteItemLocation(buffer, box, location, items) {
  const header = Buffer.from(
    buffer.subarray(
      location.dataStart,
      location.dataStart + ITEM_LOCATION_SIZE_BYTES + location.itemCountSize
    )
  )
  writeUInt(header, items.length, ITEM_LOCATION_SIZE_BYTES, location.itemCountSize)

  const payload = Buffer.concat([
    header,
    ...items.map((item) => buffer.subarray(item.start, item.end))
  ])
  return rewriteFullBox(box, location.version, location.flags, payload, {
    extendsToEnd: false
  })
}

function parsePrimaryItem(buffer, box) {
  const fullBox = parseFullBox(buffer, box)
  const idSize = fullBox.version === 0 ? UINT16_BYTES : UINT32_BYTES
  return readUInt(buffer, fullBox.dataStart, idSize)
}

function rewriteItemReferences(buffer, box, metadataItemIds) {
  const fullBox = parseFullBox(buffer, box)
  if (fullBox.version > MAX_ITEM_REFERENCE_VERSION) {
    throw new Error('Unsupported HEIF item reference version')
  }

  const idSize = fullBox.version === 0 ? UINT16_BYTES : UINT32_BYTES
  const references = parseBoxes(buffer, fullBox.dataStart, box.end)
  const rewritten = []

  for (const reference of references) {
    let offset = reference.dataStart
    const fromItemId = readUInt(buffer, offset, idSize)
    offset += idSize
    const referenceCount = readUInt(buffer, offset, UINT16_BYTES)
    offset += UINT16_BYTES

    const toItemIds = []
    for (let i = 0; i < referenceCount; i++) {
      toItemIds.push(readUInt(buffer, offset, idSize))
      offset += idSize
    }

    if (offset !== reference.end) throw new Error('Invalid HEIF item reference')
    if (metadataItemIds.has(fromItemId)) continue

    const retainedItemIds = toItemIds.filter((id) => !metadataItemIds.has(id))
    if (retainedItemIds.length === 0) continue

    const payload = Buffer.allocUnsafe(idSize + UINT16_BYTES + retainedItemIds.length * idSize)
    offset = 0
    writeUInt(payload, fromItemId, offset, idSize)
    offset += idSize
    writeUInt(payload, retainedItemIds.length, offset, UINT16_BYTES)
    offset += UINT16_BYTES
    for (const id of retainedItemIds) {
      writeUInt(payload, id, offset, idSize)
      offset += idSize
    }

    rewritten.push(rewriteBox(reference, payload))
  }

  return rewriteFullBox(box, fullBox.version, fullBox.flags, Buffer.concat(rewritten), {
    extendsToEnd: false
  })
}

function rewritePropertyAssociations(buffer, box, metadataItemIds) {
  const fullBox = parseFullBox(buffer, box)
  if (fullBox.version > MAX_PROPERTY_ASSOCIATION_VERSION) {
    throw new Error('Unsupported HEIF property association version')
  }

  const itemIdSize = fullBox.version === 0 ? UINT16_BYTES : UINT32_BYTES
  const associationSize = fullBox.flags & LARGE_PROPERTY_INDEX_FLAG ? UINT16_BYTES : UINT8_BYTES
  let offset = fullBox.dataStart
  const entryCount = readUInt(buffer, offset, UINT32_BYTES)
  offset += UINT32_BYTES
  if (entryCount > MAX_ITEMS) {
    throw new Error('Invalid HEIF property association box')
  }
  const entries = []

  for (let i = 0; i < entryCount; i++) {
    const start = offset
    const itemId = readUInt(buffer, offset, itemIdSize)
    offset += itemIdSize
    const associationCount = readUInt(buffer, offset, UINT8_BYTES)
    offset += UINT8_BYTES + associationCount * associationSize
    if (offset > box.end) throw new Error('Invalid HEIF property association box')
    if (!metadataItemIds.has(itemId)) entries.push(buffer.subarray(start, offset))
  }

  if (offset !== box.end) throw new Error('Invalid HEIF property association box')

  const count = Buffer.allocUnsafe(UINT32_BYTES)
  writeUInt(count, entries.length, 0, UINT32_BYTES)
  return rewriteFullBox(box, fullBox.version, fullBox.flags, Buffer.concat([count, ...entries]))
}

function rewriteItemProperties(buffer, box, metadataItemIds) {
  const children = parseBoxes(buffer, box.dataStart, box.end)
  const payload = rewriteBoxes(buffer, children, (child) => {
    if (child.type === BOX_TYPE.PROPERTY_ASSOCIATION) {
      return rewritePropertyAssociations(buffer, child, metadataItemIds)
    }
  })
  return rewriteBox(box, payload, { extendsToEnd: false })
}

function mergeRanges(ranges) {
  const sorted = ranges.filter((range) => range.end > range.start).sort((a, b) => a.start - b.start)
  const merged = []

  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end
}

function metadataItemRanges(
  items,
  metadataItemIds,
  constructionMethod,
  sourceLength,
  extraRanges = []
) {
  const removed = [...extraRanges]
  const retained = []

  for (const item of items) {
    if (item.constructionMethod > MAX_CONSTRUCTION_METHOD) {
      throw new Error(`Unsupported HEIF item construction method ${item.constructionMethod}`)
    }

    if (item.constructionMethod !== constructionMethod || item.dataReferenceIndex !== 0) continue

    for (const extent of item.extents) {
      // A zero (or omitted) length denotes the entire source, not an empty extent.
      if (extent.length === 0 && (sourceLength === null || item.extents.length !== 1)) {
        throw new Error('Invalid HEIF implicit extent length')
      }

      const start = item.baseOffset + extent.offset
      const end = extent.length === 0 ? sourceLength : start + extent.length
      if (sourceLength === null || start > end || end > sourceLength) {
        throw new Error('Invalid HEIF item data location')
      }

      const range = {
        start,
        end
      }
      const ranges = metadataItemIds.has(item.id) ? removed : retained
      ranges.push(range)
    }
  }

  const removedRanges = mergeRanges(removed)
  for (const removedRange of removedRanges) {
    if (retained.some((retainedRange) => overlaps(removedRange, retainedRange))) {
      throw new Error('HEIF metadata shares storage with a retained item')
    }
  }

  return removedRanges
}

function assertMetadataItemLocations(metadataItemIds, itemLocation) {
  if (metadataItemIds.size === 0) return
  if (!itemLocation) throw new Error('Missing HEIF item location box')

  const locatedItemIds = new Set(itemLocation.items.map((item) => item.id))
  for (const id of metadataItemIds) {
    if (!locatedItemIds.has(id)) {
      throw new Error(`Missing HEIF item location for metadata item ${id}`)
    }
  }
}

function assertNoMetadataOverlap(items, metadataItemIds, constructionMethod, sourceLength, ranges) {
  metadataItemRanges(items, metadataItemIds, constructionMethod, sourceLength, ranges)
}

function assertRangesAreInBoxes(ranges, boxes) {
  for (const range of ranges) {
    if (!boxes.some((box) => range.start >= box.dataStart && range.end <= box.end)) {
      throw new Error('HEIF metadata is stored outside a media data box')
    }
  }
}

function validateSamsungBox(buffer, box) {
  const invalid = () => {
    throw new Error('Unsupported Samsung sefd metadata structure')
  }

  if (box.end - box.dataStart < SAMSUNG_DIRECTORY_HEADER_BYTES + SAMSUNG_FOOTER_BYTES) invalid()
  if (
    buffer.toString('latin1', box.end - SAMSUNG_SIGNATURE_BYTES, box.end) !==
    SAMSUNG_SIGNATURE.TRAILER
  ) {
    invalid()
  }

  const directorySize = buffer.readUInt32LE(box.end - SAMSUNG_FOOTER_BYTES)
  const directoryStart = box.end - SAMSUNG_FOOTER_BYTES - directorySize
  if (directorySize < SAMSUNG_DIRECTORY_HEADER_BYTES || directoryStart < box.dataStart) invalid()
  const directorySignature = buffer.toString(
    'latin1',
    directoryStart,
    directoryStart + SAMSUNG_SIGNATURE_BYTES
  )
  if (directorySignature !== SAMSUNG_SIGNATURE.DIRECTORY) invalid()

  const count = buffer.readUInt32LE(directoryStart + SAMSUNG_DIRECTORY_COUNT_OFFSET)
  if (SAMSUNG_DIRECTORY_HEADER_BYTES + count * SAMSUNG_DIRECTORY_ENTRY_BYTES !== directorySize) {
    invalid()
  }

  for (let i = 0; i < count; i++) {
    const entry =
      directoryStart + SAMSUNG_DIRECTORY_HEADER_BYTES + i * SAMSUNG_DIRECTORY_ENTRY_BYTES
    const offset = buffer.readUInt32LE(entry + UINT32_BYTES)
    const size = buffer.readUInt32LE(entry + SAMSUNG_ITEM_HEADER_BYTES)
    const start = directoryStart - offset

    if (start < box.dataStart || size < SAMSUNG_ITEM_HEADER_BYTES || size > offset) invalid()
    if (buffer.readUInt32LE(start) !== buffer.readUInt32LE(entry)) invalid()
    if (buffer.readUInt32LE(start + UINT32_BYTES) > size - SAMSUNG_ITEM_HEADER_BYTES) invalid()
  }
}

function parseMetaContainer(buffer) {
  let meta = null
  const vendorBoxes = []
  const topLevel = parseBoxes(buffer)

  for (const box of topLevel) {
    if (box.type === BOX_TYPE.META) {
      if (meta) throw new Error('Invalid HEIF metadata container')
      meta = box
    } else if (VENDOR_BOX_VALIDATORS.has(box.type)) {
      VENDOR_BOX_VALIDATORS.get(box.type)(buffer, box)
      vendorBoxes.push(box)
    }
  }

  if (!meta) throw new Error('Invalid HEIF metadata container')

  const metaFullBox = parseFullBox(buffer, meta)
  const children = parseBoxes(buffer, metaFullBox.dataStart, meta.end)

  const itemInfoBoxes = children.filter((box) => box.type === BOX_TYPE.ITEM_INFO)
  if (itemInfoBoxes.length !== 1) {
    throw new Error('Invalid HEIF item information')
  }
  if (children.filter((box) => box.type === BOX_TYPE.ITEM_LOCATION).length > 1) {
    throw new Error('Invalid HEIF item location box')
  }

  const itemInfo = parseItemInfo(buffer, itemInfoBoxes[0])

  return {
    topLevel,
    meta,
    metaFullBox,
    vendorBoxes,
    children,
    itemInfo
  }
}

function collectMetadataItemIds(buffer, itemInfo) {
  const metadataItemIds = new Set()

  for (const entry of itemInfo.entries) {
    const item = itemInfoEntry(buffer, entry)
    if (item && isMetadataItem(item)) {
      metadataItemIds.add(item.id)
    }
  }

  return metadataItemIds
}

function resolveMetadataRanges(buffer, container, itemLocations, metadataItemIds) {
  const { topLevel, vendorBoxes, children } = container

  const mdatBoxes = topLevel.filter((box) => box.type === BOX_TYPE.MEDIA_DATA)
  const vendorMetadataRanges = vendorBoxes.map((box) => ({ start: box.start, end: box.end }))
  const mdatMetadataRanges = metadataItemRanges(
    itemLocations,
    metadataItemIds,
    FILE_OFFSET_CONSTRUCTION_METHOD,
    buffer.byteLength
  )
  assertNoMetadataOverlap(
    itemLocations,
    metadataItemIds,
    FILE_OFFSET_CONSTRUCTION_METHOD,
    buffer.byteLength,
    vendorMetadataRanges
  )
  assertRangesAreInBoxes(mdatMetadataRanges, mdatBoxes)

  const idatBoxes = children.filter((box) => box.type === BOX_TYPE.ITEM_DATA)
  const idatPayloadLength =
    idatBoxes.length === 1 ? idatBoxes[0].end - idatBoxes[0].dataStart : null
  const idatMetadataRanges = metadataItemRanges(
    itemLocations,
    metadataItemIds,
    ITEM_DATA_CONSTRUCTION_METHOD,
    idatPayloadLength
  )

  if (idatMetadataRanges.length > 0 && idatBoxes.length !== 1) {
    throw new Error('Invalid HEIF item data storage')
  }

  if (idatMetadataRanges.some((range) => range.start < 0 || range.end > idatPayloadLength)) {
    throw new Error('Invalid HEIF item data location')
  }

  return { mdatMetadataRanges, idatMetadataRanges, vendorMetadataRanges }
}

function rewriteMetaBox(buffer, container, rewrites) {
  const { meta, metaFullBox, children, itemInfo } = container
  const { itemLocation, metadataItemIds, idatMetadataRanges } = rewrites
  const retainedItemLocations = (itemLocation?.items ?? []).filter(
    (item) => !metadataItemIds.has(item.id)
  )

  const rewrittenChildren = rewriteBoxes(buffer, children, (box) => {
    switch (box.type) {
      case BOX_TYPE.ITEM_INFO:
        return rewriteItemInfo(buffer, box, itemInfo, metadataItemIds)
      case BOX_TYPE.ITEM_LOCATION:
        return rewriteItemLocation(buffer, box, itemLocation, retainedItemLocations)
      case BOX_TYPE.ITEM_REFERENCE:
        return rewriteItemReferences(buffer, box, metadataItemIds)
      case BOX_TYPE.ITEM_PROPERTIES:
        return rewriteItemProperties(buffer, box, metadataItemIds)
      case BOX_TYPE.ITEM_DATA: {
        const payload = buffer.subarray(box.dataStart, box.end)
        return rewriteBox(box, copyWithZeroedRanges(payload, idatMetadataRanges), {
          extendsToEnd: false
        })
      }
      default:
        return box.extendsToEnd
          ? rewriteBox(box, buffer.subarray(box.dataStart, box.end), { extendsToEnd: false })
          : undefined
    }
  })

  const padding = meta.size - meta.headerSize - FULL_BOX_FIELDS_BYTES - rewrittenChildren.byteLength
  if (padding < FREE_BOX_HEADER_BYTES) {
    throw new Error('Cannot preserve the HEIF metadata box size')
  }

  const free = encodeBox(BOX_TYPE.FREE, Buffer.alloc(padding - FREE_BOX_HEADER_BYTES))
  return rewriteFullBox(
    meta,
    metaFullBox.version,
    metaFullBox.flags,
    Buffer.concat([rewrittenChildren, free])
  )
}

function stripHEIFMetadata(buffer) {
  const container = parseMetaContainer(buffer)
  const { vendorBoxes, meta, children, itemInfo } = container

  const metadataItemIds = collectMetadataItemIds(buffer, itemInfo)
  if (metadataItemIds.size === 0 && vendorBoxes.length === 0) {
    return Buffer.from(buffer)
  }

  const primaryItemBox = children.find((box) => box.type === BOX_TYPE.PRIMARY_ITEM)
  if (primaryItemBox && metadataItemIds.has(parsePrimaryItem(buffer, primaryItemBox))) {
    throw new Error('Cannot remove the primary HEIF item')
  }

  const itemLocationBox = children.find((box) => box.type === BOX_TYPE.ITEM_LOCATION)
  const itemLocation = itemLocationBox ? parseItemLocation(buffer, itemLocationBox) : null
  const itemLocations = itemLocation ? itemLocation.items : []
  assertMetadataItemLocations(metadataItemIds, itemLocation)

  const { mdatMetadataRanges, idatMetadataRanges, vendorMetadataRanges } = resolveMetadataRanges(
    buffer,
    container,
    itemLocations,
    metadataItemIds
  )

  const fileMetadataRanges = mergeRanges([...mdatMetadataRanges, ...vendorMetadataRanges])
  const output = copyWithZeroedRanges(buffer, fileMetadataRanges)
  for (const box of vendorBoxes) {
    rewriteAsZeroFilledBox(box, BOX_TYPE.FREE).copy(output, box.start)
  }

  if (metadataItemIds.size === 0) return output

  const paddedMeta = rewriteMetaBox(buffer, container, {
    itemLocation,
    metadataItemIds,
    idatMetadataRanges
  })

  paddedMeta.copy(output, meta.start)
  return output
}

export { stripHEIFMetadata }
