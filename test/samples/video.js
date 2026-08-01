import { test } from 'brittle'
import fs from 'bare-fs'
import os from 'bare-os'
import barePath from 'bare-path'

import { video } from '../..'
import { randomFileName } from '../helpers'
import suite from './suites/video.json' with { type: 'json' }

for (const sample of suite.tests.metadata.samples) {
  test(`video metadata ${sample.id}`, async (t) => {
    const path = pathFor(sample.id)

    const metadata = await video(path).metadata()
    t.is(metadata.width, sample.width, 'metadata width')
    t.is(metadata.height, sample.height, 'metadata height')
    t.is(metadata.codec.name, sample.codec, 'metadata codec')
    t.ok(
      Math.abs(metadata.duration - sample.duration) <= suite.tests.metadata.durationTolerance,
      'metadata duration'
    )
    t.is(metadata.displayRotation, sample.displayRotation || 0, 'metadata display rotation')
    t.is(metadata.rotation, sample.rotation || 0, 'metadata corrective rotation')
  })
}

for (const sample of toSamples(suite.tests.extractFrames.samples)) {
  test(`video extractFrames ${sample.id}`, async (t) => {
    const path = pathFor(sample.id)

    const metadata = await video(path).metadata()
    const frame = await video(path).extractFrames({ frameIndex: 0 })
    t.is(frame.width, metadata.width, 'extractFrames() width')
    t.is(frame.height, metadata.height, 'extractFrames() height')
    t.is(frame.data.byteLength, frame.width * frame.height * 4, 'extractFrames() returns RGBA')
  })
}

for (const sample of toSamples(suite.tests.transcode.samples)) {
  for (const format of suite.tests.transcode.formats) {
    const skip = suite.tests.transcode.skip.find(
      (skip) => skip.sample === sample.id && skip.format === format
    )
    const run = skip ? test.skip : test

    run(`video transcode ${sample.id} to ${format}`, async (t) => {
      const inputPath = pathFor(sample.id)
      const outputPath = barePath.join(os.tmpdir(), randomFileName(extensionFor(format)))
      t.teardown(() => {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      })

      const fd = fs.openSync(outputPath, 'w')

      let chunks = 0
      let bytes = 0
      let previousTime = 0
      let buffersAreValid = true
      let timesAreValid = true
      let timesAreMonotonic = true

      try {
        for await (const chunk of video(inputPath).transcode({ format })) {
          buffersAreValid &&= Buffer.isBuffer(chunk.buffer)
          timesAreValid &&= Number.isFinite(chunk.time) && chunk.time >= 0
          timesAreMonotonic &&= chunk.time >= previousTime

          previousTime = chunk.time
          chunks++
          bytes += chunk.buffer.byteLength
          fs.writeSync(fd, chunk.buffer)
        }
      } finally {
        fs.closeSync(fd)
      }

      t.ok(chunks > 0, 'chunks')
      t.ok(bytes > 0, 'bytes')
      t.ok(buffersAreValid, 'all chunks contain buffers')
      t.ok(timesAreValid, 'all chunk times are finite and non-negative')
      t.ok(timesAreMonotonic, 'chunk times are monotonic')

      okContainer(t, outputPath, format)

      const source = await video(inputPath).metadata()
      const metadata = await video(outputPath).metadata()

      t.is(metadata.width, source.width, 'width')
      t.is(metadata.height, source.height, 'height')
      t.is(metadata.codec.name, 'vp9', 'codec')
      if (source.duration > 0) {
        const tolerance = Math.max(0.12, source.duration * 0.1)
        t.ok(Math.abs(metadata.duration - source.duration) <= tolerance, 'duration')
      } else {
        t.ok(metadata.duration >= 0, 'duration')
      }
    })
  }
}

function toSamples(ids) {
  return ids.map((id) => ({ id }))
}

function pathFor(id) {
  return samplePath(suite.catalog, id)
}

function samplePath(catalog, id) {
  const sample = catalog.samples.find((sample) => sample.id === id)
  if (!sample) throw new Error(`Unknown sample id: ${id}`)
  return barePath.join('./test/samples/files', sample.source, sample.path)
}

function extensionFor(format) {
  return format === 'matroska' ? 'mkv' : format
}

function okContainer(t, filename, format) {
  const fd = fs.openSync(filename, 'r')
  const header = Buffer.alloc(8)

  try {
    fs.readSync(fd, header, 0, header.byteLength, 0)
  } finally {
    fs.closeSync(fd)
  }

  if (format === 'mp4') {
    t.is(header.toString('ascii', 4, 8), 'ftyp', 'output is MP4')
  } else {
    t.alike([...header.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'output is EBML')
  }
}
