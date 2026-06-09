#!/usr/bin/env bare
import { command, summary, arg, flag, bail } from 'paparam'
import fs from 'bare-fs'
import path from 'bare-path'
import { image, video } from 'bare-media'
import {
  supportedImageMimetypes,
  supportedVideoMimetypes,
  isImageSupported,
  isStripMetadataSupported
} from 'bare-media/types'
import getMimeType from 'get-mime-type'
import { detectMimeType } from './src/util'

import pkg from './package'

const cli = command(
  pkg.name,
  summary(pkg.description),
  bail(({ reason, flag, arg }) => {
    if (flag) return `Unknown or invalid flag: ${flag.long ? '--' : '-'}${flag.name}`
    if (arg) return `Unknown argument: ${arg.value}`
    return reason
  }),
  flag('--version|-v', 'Print version'),
  command(
    'metadata',
    summary('Print image or video metadata (experimental)'),
    arg('<input>', 'Input media file'),
    arg('[output]', 'Output media file'),
    flag('--strip', 'Strip image metadata'),
    flag('--json|-j', 'Print JSON'),
    metadata
  ),
  command(
    'convert',
    summary('Convert an image'),
    arg('<input>', 'Input image file'),
    arg('<output>', 'Output image file'),
    flag('--max-width|-w <px>', 'Maximum output width'),
    flag('--max-height|-h <px>', 'Maximum output height'),
    flag('--max-frames|-f <n>', 'Maximum frames to decode'),
    flag('--max-bytes|-n <n>', 'Maximum encoded size'),
    flag('--orientate|-o', 'Apply EXIF orientation'),
    convert
  ),
  command(
    'transcode',
    summary('Transcode a video'),
    arg('<input>', 'Input video file'),
    arg('<output>', 'Output video file'),
    flag('--width <px>', 'Output width'),
    flag('--height <px>', 'Output height'),
    transcode
  ),
  command('types', summary('List supported MIME types'), types),
  (cmd) => {
    if (cmd.flags.version) {
      console.log(pkg.version)
      return
    }
    console.log(cli.usage())
  }
)

async function metadata(parsed) {
  const input = validateInput(parsed.args.input)
  const mimetype = detectMimeType(await head(input))

  if (parsed.flags.strip) {
    if (!isStripMetadataSupported(mimetype)) {
      throw new Error(`Metadata stripping is not supported for ${mimetype}`)
    }
    if (!parsed.args.output) {
      throw new Error('Missing output path')
    }
    const output = path.resolve(parsed.args.output)
    await image(input).metadata.strip().save(output)
    return
  }

  if (mimetype.startsWith('image/')) {
    const data = await image(input).metadata()
    const out = data || { mimetype }
    print(out, { json: parsed.flags.json })
    return
  }

  const data = await video(input).metadata()
  print(data, { json: parsed.flags.json })
}

async function convert(parsed) {
  const input = validateInput(parsed.args.input)
  const output = path.resolve(parsed.args.output)
  let source = input

  const maxWidth = validateFlag(parsed.flags.maxWidth, '--max-width', 'number')
  const maxHeight = validateFlag(parsed.flags.maxHeight, '--max-height', 'number')
  const maxFrames = validateFlag(parsed.flags.maxFrames, '--max-frames', 'number')
  const maxBytes = validateFlag(parsed.flags.maxBytes, '--max-bytes', 'number')
  const mimetype = getMimeType(output)

  let pipeline = image(source).decode({ maxFrames })
  if (parsed.flags.orientate) pipeline = pipeline.orientate()
  if (maxWidth || maxHeight) {
    pipeline = pipeline.resize({
      maxWidth: maxWidth || Number.MAX_SAFE_INTEGER,
      maxHeight: maxHeight || Number.MAX_SAFE_INTEGER
    })
  }
  await pipeline.encode({ mimetype, maxBytes }).save(output)

  console.log(output)
}

async function transcode(parsed) {
  const input = validateInput(parsed.args.input)
  const output = path.resolve(parsed.args.output)
  const width = validateFlag(parsed.flags.width, '--width', 'number')
  const height = validateFlag(parsed.flags.height, '--height', 'number')
  const mimetype = getMimeType(output)
  const format = mimetype.split('/')[1]

  const chunks = video(input).transcode({ format, width, height })
  const fd = fs.openSync(output, 'w')
  try {
    for await (const chunk of chunks) fs.writeSync(fd, chunk.buffer)
  } finally {
    fs.closeSync(fd)
  }

  console.log(output)
}

function types() {
  console.log('Images:')
  for (const mimetype of supportedImageMimetypes) console.log(`  ${mimetype}`)
  console.log('Videos:')
  for (const mimetype of supportedVideoMimetypes) console.log(`  ${mimetype}`)
}

async function head(filePath, byteLength = 4100) {
  const fd = await fs.open(filePath)

  const buffer = Buffer.alloc(byteLength)

  try {
    await fs.read(fd, buffer)
  } finally {
    await fs.close(fd)
  }

  return buffer
}

function validateInput(input) {
  const file = path.resolve(input)
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`)
  return file
}

function validateFlag(value, name, type) {
  if (type === 'number' && value !== undefined) {
    return Number.parseInt(value)
  }
  return value
}

function print(value, opts = {}) {
  const { prefix = '', json = false } = opts

  if (json) {
    console.log(JSON.stringify(value, null, 2))
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    if (entry && typeof entry === 'object') {
      if (Buffer.isBuffer(entry)) {
        console.log(`${prefix}${key}:`, entry.toString())
      } else if (Array.isArray(entry)) {
        console.log(`${prefix}${key}:`)
        for (const value of entry) {
          print(value, { prefix: `${prefix}  ` })
        }
      } else {
        console.log(`${prefix}${key}:`)
        print(entry, { prefix: `${prefix}  ` })
      }
    } else {
      console.log(`${prefix}${key}: ${String(entry)}`)
    }
  }
}

cli.parse()
