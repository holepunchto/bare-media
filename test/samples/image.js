import { test, hook } from 'brittle'
import fs from 'bare-fs'

import { detectMimeType, image } from '../..'
import { randomFileName } from '../helpers'

import suite from './suites/image'
import download from './download'
import { samplePath } from './helpers'

hook('download samples', { timeout: 180_000 }, async function (t) {
  await download()
})

for (const sample of suite.tests.metadata.samples) {
  test(`samples: image metadata() ${sample.path}`, async (t) => {
    const path = pathFor(sample.path)

    const metadata = await image(path).metadata()
    t.is(metadata.orientation, sample.orientation, 'orientation')
  })
}

for (const sample of suite.tests.metadata.samples) {
  test(`samples: image metadata.strip() ${sample.path}`, async (t) => {
    const path = pathFor(sample.path)

    const source = fs.readFileSync(path)
    const stripped = await image.metadata.strip(source)
    const strippedMetadata = await image.metadata(stripped)

    t.absent(strippedMetadata.orientation, 'removes orientation')

    const kept = await image.metadata.strip(source, { keepOrientation: true })
    const metadata = await image.metadata(kept)
    t.is(metadata.orientation, sample.orientation, 'keeps orientation')
  })
}

for (const sample of suite.tests.decode.samples) {
  test(`samples: image decode ${sample.path}`, async (t) => {
    const path = pathFor(sample.path)

    const rgba = await image(path).decode()
    t.is(rgba.width, sample.width, 'width')
    t.is(rgba.height, sample.height, 'height')
    t.is(frameLength(rgba), sample.frames, 'frames length')

    for (const frame of Array.isArray(rgba.frames) ? rgba.frames : [rgba]) {
      t.is(frame.data.byteLength, frame.width * frame.height * 4, 'frames byteLength')
    }
  })
}

for (const sample of suite.tests.crop.samples) {
  test(`samples: image crop ${sample}`, async (t) => {
    const path = pathFor(sample)

    const rgba = await image(path).decode()
    const width = Math.max(1, Math.floor(rgba.width / 2))
    const height = Math.max(1, Math.floor(rgba.height / 2))
    const cropped = image.crop(rgba, { left: 0, top: 0, width, height })

    t.is(cropped.width, width, 'width')
    t.is(cropped.height, height, 'height')
  })
}

for (const sample of suite.tests.resize.samples) {
  test(`samples: image resize ${sample}`, async (t) => {
    const path = pathFor(sample)

    const resized = await image(path).decode().resize({ maxWidth: 64, maxHeight: 64 })

    t.ok(resized.width <= 64 && resized.height <= 64)
  })
}

for (const sample of suite.tests.orientate.exif) {
  test(`samples: image orientate ${sample.path}`, async (t) => {
    const path = pathFor(sample.path)

    const oriented = await image(path).decode().orientate()
    t.is(oriented.width, sample.orientedWidth, 'width')
    t.is(oriented.height, sample.orientedHeight, 'height')
  })
}

for (const sample of suite.tests.orientate.samples) {
  test(`samples: image orientate with transform ${sample}`, async (t) => {
    const path = pathFor(sample)

    const rgba = await image(path).decode()
    const oriented = await image.orientate(rgba, {
      transform: { rotate: 90, flipH: false, flipV: false }
    })

    t.is(oriented.width, rgba.height, 'width')
    t.is(oriented.height, rgba.width, 'height')
  })
}

for (const sample of suite.tests.rotate.samples) {
  test(`samples: image rotate ${sample}`, async (t) => {
    const path = pathFor(sample)

    const rgba = await image(path).decode()
    const rotated = image.rotate(rgba, { deg: 90 })

    t.is(rotated.width, rgba.height, 'width')
    t.is(rotated.height, rgba.width, 'height')
  })
}

for (const sample of suite.tests.flip.samples) {
  test(`samples: image flip ${sample}`, async (t) => {
    const path = pathFor(sample)

    const rgba = await image(path).decode()
    const flipped = image.flip(image.flip(rgba, { h: true, v: false }), {
      h: true,
      v: false
    })
    t.alike(firstFrame(flipped).data, firstFrame(rgba).data, 'double flip')
  })
}

for (const sample of suite.tests.encode.samples) {
  for (const mimetype of suite.tests.encode.mimetypes) {
    test(`samples: image encode ${sample} as ${mimetype}`, { timeout: 120_000 }, async (t) => {
      const path = pathFor(sample)

      const rgba = firstFrame(await image(path).decode())
      const encoded = await image.encode(rgba, { mimetype })

      t.ok(encoded.byteLength > 0, 'byteLength')
      t.is(detectMimeType(encoded), mimetype, 'mimetype')
    })
  }
}

for (const sample of suite.tests.encode.animated) {
  test(`samples: image encode animation ${sample.path}`, async (t) => {
    const path = pathFor(sample.path)

    const rgba = await image(path).decode()
    const encoded = await image.encode(rgba, { mimetype: 'image/webp' })
    const decoded = await image.decode(encoded)

    t.is(frameLength(decoded), sample.frames, 'animated WebP roundtrip')
  })
}

function pathFor(path) {
  return samplePath(suite.catalog, path)
}

export function frameLength(rgba) {
  return Array.isArray(rgba.frames) ? rgba.frames.length : 1
}

export function firstFrame(rgba) {
  if (!Array.isArray(rgba.frames)) return rgba
  const frame = rgba.frames[0]
  return { width: frame.width, height: frame.height, data: frame.data }
}
