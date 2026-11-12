import { test } from 'brittle'
import fs from 'bare-fs'
import path from 'bare-path'
import tmp from 'test-tmp'
import { audio } from '..'

const SEGMENT_1 = 'test/fixtures/voice-segment-1.m4a'
const SEGMENT_2 = 'test/fixtures/voice-segment-2.m4a'
const SEGMENT_22KHZ = 'test/fixtures/voice-segment-22khz.m4a'
const DURATION_TOLERANCE = 0.1

async function totalDuration(inputs) {
  let total = 0
  for (const input of inputs) total += (await audio(input).metadata()).duration
  return total
}

test('audio metadata()', async (t) => {
  const metadata = await audio('test/fixtures/audio.flac').metadata()

  t.is(metadata.codec.name, 'flac')
  t.is(metadata.sampleRate, 48000)
  t.is(metadata.channels, 2)
  t.is(metadata.duration, 0.25)
})

test('audio.metadata(fd)', async (t) => {
  const fd = fs.openSync('test/fixtures/audio.flac', 'r')
  try {
    const metadata = await audio.metadata(fd)
    t.is(metadata.codec.name, 'flac')
    t.ok(fs.fstatSync(fd).size > 0)
    t.alike(await audio.metadata(fd), metadata)
  } finally {
    fs.closeSync(fd)
  }
})

test('audio metadata() reads audio in a video container', async (t) => {
  const metadata = await audio('test/fixtures/sample-stereo.mp4').metadata()

  t.is(metadata.channels, 2)
  t.ok(metadata.sampleRate > 0)
  t.ok(metadata.duration > 0)
})

test('audio metadata() rejects files without audio', async (t) => {
  await t.exception(audio('test/fixtures/orientation.mov').metadata(), /No audio stream found/)
})

test('audio concat() joins segments', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')
  const inputs = [SEGMENT_1, SEGMENT_2]

  const result = await audio(inputs).concat(output)

  t.ok(fs.existsSync(output))

  const reference = await audio(SEGMENT_1).metadata()
  const metadata = await audio(output).metadata()

  t.is(metadata.codec.name, 'aac')
  t.is(metadata.sampleRate, reference.sampleRate)
  t.is(metadata.channels, reference.channels)
  t.ok(Math.abs(metadata.duration - (await totalDuration(inputs))) < DURATION_TOLERANCE)
  t.ok(Math.abs(result.duration - metadata.duration) < DURATION_TOLERANCE)
})

test('audio concat() joins three segments in order', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')
  const inputs = [SEGMENT_1, SEGMENT_2, SEGMENT_1]

  const result = await audio(inputs).concat(output)
  const metadata = await audio(output).metadata()

  t.ok(Math.abs(metadata.duration - (await totalDuration(inputs))) < DURATION_TOLERANCE)
  t.ok(Math.abs(result.duration - metadata.duration) < DURATION_TOLERANCE)
})

test('audio concat() remuxes a single input', async (t) => {
  const output = path.join(await tmp(t), 'single.m4a')

  const result = await audio([SEGMENT_1]).concat(output)
  const metadata = await audio(output).metadata()

  t.is(metadata.codec.name, 'aac')
  t.ok(Math.abs(metadata.duration - (await totalDuration([SEGMENT_1]))) < DURATION_TOLERANCE)
  t.ok(Math.abs(result.duration - metadata.duration) < DURATION_TOLERANCE)
})

test('audio.concat(fds, fd)', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')
  const first = fs.openSync(SEGMENT_1, 'r')
  const second = fs.openSync(SEGMENT_2, 'r')
  const out = fs.openSync(output, 'w')

  try {
    const result = await audio.concat([first, second], out)
    t.ok(result.duration > 0)
    t.ok(fs.fstatSync(first).size > 0)
    t.ok(fs.fstatSync(second).size > 0)
    t.ok(fs.fstatSync(out).size > 0)
  } finally {
    fs.closeSync(first)
    fs.closeSync(second)
    fs.closeSync(out)
  }

  const metadata = await audio(output).metadata()
  t.ok(
    Math.abs(metadata.duration - (await totalDuration([SEGMENT_1, SEGMENT_2]))) < DURATION_TOLERANCE
  )
})

test('audio concat() rejects segments with different sample rates', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')

  await t.exception(audio([SEGMENT_1, SEGMENT_22KHZ]).concat(output), /Segment 1 does not match/)
  t.absent(fs.existsSync(output))
})

test('audio concat() rejects an empty input list', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')

  await t.exception(audio([]).concat(output), /At least one input is required/)
  t.absent(fs.existsSync(output))
})

test('audio concat() rejects inputs without audio', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')

  await t.exception(
    audio(['test/fixtures/orientation.mov']).concat(output),
    /No audio stream found/
  )
  t.absent(fs.existsSync(output))
})

test('audio concat() accepts a single path', async (t) => {
  const output = path.join(await tmp(t), 'single.m4a')

  const result = await audio(SEGMENT_1).concat(output)
  const metadata = await audio(output).metadata()

  t.ok(Math.abs(result.duration - metadata.duration) < DURATION_TOLERANCE)
})
