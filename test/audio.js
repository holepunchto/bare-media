import { test } from 'brittle'
import fs from 'bare-fs'
import path from 'bare-path'
import tmp from 'test-tmp'
import { audio } from '..'

const SEGMENT_1 = 'test/fixtures/voice-segment-1.m4a'
const SEGMENT_2 = 'test/fixtures/voice-segment-2.m4a'
const SEGMENT_22KHZ = 'test/fixtures/voice-segment-22khz.m4a'
const DURATION_TOLERANCE = 0.1
const INVALID_INPUTS_ERROR = /must be a file descriptor/

/** Returns the summed duration of the inputs in seconds. */
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

async function assertJoined(t, buffer, inputs) {
  const output = path.join(await tmp(t), 'joined.m4a')
  await fs.writeFile(output, buffer)

  const reference = await audio(inputs[0]).metadata()
  const metadata = await audio(output).metadata()

  t.is(metadata.codec.name, 'aac')
  t.is(metadata.sampleRate, reference.sampleRate)
  t.is(metadata.channels, reference.channels)
  t.ok(Math.abs(metadata.duration - (await totalDuration(inputs))) < DURATION_TOLERANCE)
}

test('audio(input).concat(input) resolves a buffer', async (t) => {
  const buffer = await audio(SEGMENT_1).concat(SEGMENT_2)

  t.ok(Buffer.isBuffer(buffer))
  await assertJoined(t, buffer, [SEGMENT_1, SEGMENT_2])
})

test('audio(input).concat(inputs) joins in order', async (t) => {
  const buffer = await audio(SEGMENT_1).concat([SEGMENT_2, SEGMENT_1])

  await assertJoined(t, buffer, [SEGMENT_1, SEGMENT_2, SEGMENT_1])
})

test('audio().concat(inputs) joins in order', async (t) => {
  const buffer = await audio().concat([SEGMENT_1, SEGMENT_2, SEGMENT_1])

  await assertJoined(t, buffer, [SEGMENT_1, SEGMENT_2, SEGMENT_1])
})

test('audio concat() calls can be chained', async (t) => {
  const buffer = await audio(SEGMENT_1).concat(SEGMENT_2).concat(SEGMENT_1)

  await assertJoined(t, buffer, [SEGMENT_1, SEGMENT_2, SEGMENT_1])
})

test('audio concat() joins many inputs into a large output', async (t) => {
  const inputs = new Array(8).fill(SEGMENT_2)
  const buffer = await audio().concat(inputs)

  t.ok(buffer.byteLength > 4 * 64 * 1024)
  await assertJoined(t, buffer, inputs)
})

test('audio(input).concat(input).save() writes the joined file', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')

  await audio(SEGMENT_1).concat(SEGMENT_2).save(output)

  t.alike(await fs.readFile(output), await audio(SEGMENT_1).concat(SEGMENT_2))
})

test('audio().concat(inputs).save() writes the joined file', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')
  const inputs = [SEGMENT_1, SEGMENT_2]

  await audio().concat(inputs).save(output)

  t.alike(await fs.readFile(output), await audio().concat(inputs))
})

test('audio(input).concat([]) remuxes the single input', async (t) => {
  const buffer = await audio(SEGMENT_1).concat([])

  await assertJoined(t, buffer, [SEGMENT_1])
})

test('audio().concat([input]) remuxes the single input', async (t) => {
  const buffer = await audio().concat([SEGMENT_1])

  await assertJoined(t, buffer, [SEGMENT_1])
})

test('audio(input) without steps resolves the input bytes', async (t) => {
  t.alike(await audio(SEGMENT_1), await fs.readFile(SEGMENT_1))
})

test('audio.concat(fds) resolves a buffer and leaves the fds open', async (t) => {
  const first = fs.openSync(SEGMENT_1, 'r')
  const second = fs.openSync(SEGMENT_2, 'r')

  try {
    const buffer = await audio.concat([first, second])

    t.ok(Buffer.isBuffer(buffer))
    t.ok(fs.fstatSync(first).size > 0)
    t.ok(fs.fstatSync(second).size > 0)
    await assertJoined(t, buffer, [SEGMENT_1, SEGMENT_2])
  } finally {
    fs.closeSync(first)
    fs.closeSync(second)
  }
})

test('audio.concat(fd) remuxes a single fd', async (t) => {
  const fd = fs.openSync(SEGMENT_1, 'r')

  try {
    await assertJoined(t, await audio.concat(fd), [SEGMENT_1])
  } finally {
    fs.closeSync(fd)
  }
})

test('audio concat() rejects segments with different sample rates', async (t) => {
  await t.exception(audio(SEGMENT_1).concat(SEGMENT_22KHZ), /Segment 1 does not match/)
})

test('audio concat().save() leaves no file behind on failure', async (t) => {
  const output = path.join(await tmp(t), 'joined.m4a')

  await t.exception(audio(SEGMENT_1).concat(SEGMENT_22KHZ).save(output), /Segment 1 does not match/)
  t.absent(fs.existsSync(output))
})

test('audio concat() rejects when there are no inputs', async (t) => {
  await t.exception(audio().concat([]), /At least one input is required/)
  await t.exception(audio.concat([]), /At least one input is required/)
})

test('audio.concat() rejects inputs that are not file descriptors', async (t) => {
  await t.exception.all(audio.concat(), INVALID_INPUTS_ERROR)

  for (const inputs of [undefined, null, SEGMENT_1, 1.5, -1]) {
    await t.exception.all(audio.concat(inputs), INVALID_INPUTS_ERROR)
  }
})

test('audio.concat(fds) rejects an invalid fd and leaves the valid fd open', async (t) => {
  const fd = fs.openSync(SEGMENT_1, 'r')

  try {
    await t.exception.all(audio.concat([fd, undefined]), INVALID_INPUTS_ERROR)
    t.ok(fs.fstatSync(fd).size > 0)
  } finally {
    fs.closeSync(fd)
  }
})

test('audio concat() rejects inputs without audio', async (t) => {
  await t.exception(
    audio(SEGMENT_1).concat('test/fixtures/orientation.mov'),
    /No audio stream found/
  )
})
