import { test } from 'brittle'
import fs from 'bare-fs'
import os from 'bare-os'
import path from 'bare-path'
import process from 'bare-process'
import { spawnSync } from 'bare-subprocess'

import { image } from '..'
import { summarizeMetadata, formatMetadata } from '../lib/bin'
import { randomFileName } from './helpers'

test('CLI metadata command', (t) => {
  const result = runCli(['metadata', '--json', 'test/fixtures/exif-orientation.jpg'])
  const metadata = JSON.parse(output(result))

  t.is(result.status, 0)
  t.is(metadata.exif.EXIF_VERSION, '0210')
  t.is(metadata.orientation, 6)
})

test('CLI metadata --raw', (t) => {
  const result = runCli(['metadata', '--raw', '--json', 'test/fixtures/exif-orientation.jpg'])
  const metadata = JSON.parse(output(result))

  t.is(result.status, 0)
  t.alike(metadata.exif.EXIF_VERSION, [48, 50, 49, 48])
})

test('CLI metadata --strip', (t) => {
  const outputPath = path.join(os.tmpdir(), randomFileName('jpg'))
  t.teardown(() => fs.rm(outputPath, { force: true }))

  const result = runCli(['metadata', '--strip', 'test/fixtures/exif-orientation.jpg', outputPath])

  t.is(result.status, 0)
  t.ok(fs.statSync(outputPath).size > 0)

  const metadataResult = runCli(['metadata', '--json', outputPath])
  const metadata = JSON.parse(output(metadataResult))

  t.is(metadataResult.status, 0)
  t.absent(metadata.orientation)
  t.absent(metadata.exif?.EXIF_VERSION)
})

test('CLI metadata command with no metadata', (t) => {
  const result = runCli(['metadata', 'test/fixtures/sample.svg'])

  t.is(result.status, 0, result.stderr.toString())
  t.is(result.stdout.toString(), '', 'prints nothing')
})

test('CLI convert command', (t) => {
  const outputPath = path.join(os.tmpdir(), randomFileName('webp'))
  t.teardown(() => fs.rm(outputPath, { force: true }))

  const result = runCli([
    'convert',
    'test/fixtures/sample.jpg',
    outputPath,
    '--max-width',
    '32',
    '--max-height',
    '32'
  ])

  t.is(result.status, 0)
  t.is(output(result), outputPath)
  t.ok(fs.statSync(outputPath).size > 0)
})

test('CLI convert --max-frames', async (t) => {
  const outputPath = path.join(os.tmpdir(), randomFileName('webp'))
  t.teardown(() => fs.rm(outputPath, { force: true }))

  const result = runCli(['convert', 'test/fixtures/animated.webp', outputPath, '--max-frames', '3'])
  const rgba = await image(outputPath).decode()

  t.is(result.status, 0)
  t.is(rgba.frames.length, 3)
})

test('CLI convert --max-bytes', (t) => {
  const outputPath = path.join(os.tmpdir(), randomFileName('jpg'))
  t.teardown(() => fs.rm(outputPath, { force: true }))

  const result = runCli(['convert', 'test/fixtures/sample.jpg', outputPath, '--max-bytes', '3000'])

  t.is(result.status, 0)
  t.ok(fs.statSync(outputPath).size <= 3000)
})

test('CLI convert --orientate', async (t) => {
  const outputPath = path.join(os.tmpdir(), randomFileName('jpg'))
  t.teardown(() => fs.rm(outputPath, { force: true }))

  const result = runCli([
    'convert',
    'test/fixtures/exif-orientation.jpg',
    outputPath,
    '--orientate'
  ])
  const rgba = await image(outputPath).decode()

  t.is(result.status, 0)
  t.is(rgba.width, 150)
  t.is(rgba.height, 120)
})

test('CLI transcode command', (t) => {
  const outputPath = path.join(os.tmpdir(), randomFileName('mp4'))
  t.teardown(() => fs.rm(outputPath, { force: true }))

  const result = runCli([
    'transcode',
    'test/fixtures/sample.webm',
    outputPath,
    '--width',
    '32',
    '--height',
    '32'
  ])

  t.is(result.status, 0)
  t.is(output(result), outputPath)
  t.ok(fs.statSync(outputPath).size > 0)
})

test('CLI types command', (t) => {
  const result = runCli(['types'])
  const stdout = output(result)

  t.is(result.status, 0)
  t.ok(stdout.includes('Images:'))
  t.ok(stdout.includes('  image/jpeg'))
  t.ok(stdout.includes('Videos:'))
  t.ok(stdout.includes('  video/mp4'))
})

test('summarizeMetadata() summarizes binary buffers', (t) => {
  t.is(summarizeMetadata(Buffer.alloc(0)), '<binary data: 0 bytes>')
  t.is(summarizeMetadata(Buffer.from([0x00])), '<binary data: 1 byte>')
  t.is(summarizeMetadata(Buffer.from([0xff, 0x00])), '<binary data: 2 bytes>')
})

test('summarizeMetadata() keeps readable buffers', (t) => {
  t.is(summarizeMetadata(Buffer.from('0210')), '0210')
  t.is(summarizeMetadata(Buffer.from('CameraBrand')), 'CameraBrand')
})

test('summarizeMetadata() summarizes long or multiline text', (t) => {
  t.is(summarizeMetadata('first\nsecond'), '<text data: 12 bytes>')
  t.is(summarizeMetadata('x'.repeat(257)), '<text data: 257 bytes>')
  t.is(summarizeMetadata(Buffer.from('first\nsecond')), '<text data: 12 bytes>')
})

test('summarizeMetadata() recursively cleans metadata', (t) => {
  const input = {
    version: Buffer.from('0210'),
    items: [{ data: Buffer.from([0xff]) }]
  }

  const clean = summarizeMetadata(input)

  t.alike(clean, {
    version: '0210',
    items: [{ data: '<binary data: 1 byte>' }]
  })

  t.ok(Buffer.isBuffer(input.version), 'does not mutate metadata')
  t.ok(Buffer.isBuffer(input.items[0].data), 'does not mutate nested metadata')
})

test('formatMetadata()', (t) => {
  const metadata = {
    exif: {
      VERSION: '0210',
      RESOLUTION: { numerator: 72, denominator: 1 }
    },
    uri: [{ type: 'https://example.com', data: '<binary data: 2 bytes>' }]
  }

  t.is(
    formatMetadata(metadata),
    [
      'exif:',
      '  VERSION: 0210',
      '  RESOLUTION:',
      '    numerator: 72',
      '    denominator: 1',
      'uri:',
      '  type: https://example.com',
      '  data: <binary data: 2 bytes>'
    ].join('\n')
  )
})

test('formatMetadata() as JSON', (t) => {
  const metadata = { version: '0210', orientation: 6 }

  t.is(formatMetadata(metadata, { json: true }), JSON.stringify(metadata, null, 2))
})

test('formatMetadata() with raw buffers', (t) => {
  t.is(formatMetadata({ version: Buffer.from('0210') }), 'version: 0210')
})

function runCli(args = []) {
  const bin = path.resolve('bin.js')
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

function output(result) {
  return result.stdout.toString().trim()
}
