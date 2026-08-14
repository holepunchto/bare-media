import { test, hook } from 'brittle'
import fs from 'bare-fs'
import os from 'bare-os'
import { join } from 'bare-path'

import { video } from '../..'
import { randomFileName } from '../helpers'

import suite from './suites/video'
import download from './download'
import { samplePath } from './helpers'

hook('download samples', { timeout: 180_000 }, async function (t) {
  await download()
})

for (const sample of suite.tests.metadata.samples) {
  test(`samples: video metadata ${sample.path}`, async (t) => {
    const path = pathFor(sample.path)

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

for (const sample of suite.tests.extractFrames.samples) {
  test(`samples: video extractFrames ${sample}`, async (t) => {
    const path = pathFor(sample)

    const metadata = await video(path).metadata()
    const frame = await video(path).extractFrames({ frameIndex: 0 })
    t.is(frame.width, metadata.width, 'extractFrames() width')
    t.is(frame.height, metadata.height, 'extractFrames() height')
    t.is(frame.data.byteLength, frame.width * frame.height * 4, 'extractFrames() returns RGBA')
  })
}

for (const sample of suite.tests.transcode.samples) {
  for (const format of suite.tests.transcode.formats) {
    test(`samples: video transcode ${sample} to ${format}`, async (t) => {
      const inputPath = pathFor(sample)
      const outputPath = join(os.tmpdir(), randomFileName(extensionFor(format)))
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

      if (suite.tests.transcode.rotated.includes(sample)) {
        t.is(metadata.width, source.height, 'width')
        t.is(metadata.height, source.width, 'height')
      } else {
        t.is(metadata.width, source.width, 'width')
        t.is(metadata.height, source.height, 'height')
      }

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

function pathFor(path) {
  return samplePath(suite.catalog, path)
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
