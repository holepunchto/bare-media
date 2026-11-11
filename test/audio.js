import { test } from 'brittle'
import fs from 'bare-fs'
import { audio } from '..'

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
