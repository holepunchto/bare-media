import { test, hook } from 'brittle'

import { audio } from '../..'
import suite from './suites/audio'
import download from './download'
import { samplePath } from './helpers'

hook('download samples', { timeout: 180_000 }, async function (t) {
  await download()
})

for (const sample of suite.tests.metadata.samples) {
  test(`samples: audio metadata ${sample.path}`, async (t) => {
    const metadata = await audio(samplePath(suite.catalog, sample.path)).metadata()

    t.is(metadata.codec.name, sample.codec, 'codec')
    t.ok(Number.isInteger(metadata.codec.id), 'codec id')
    t.is(metadata.sampleRate, sample.sampleRate, 'sample rate')
    t.is(metadata.channels, sample.channels, 'channels')
    t.ok(
      Math.abs(metadata.duration - sample.duration) <= suite.tests.metadata.durationTolerance,
      'duration'
    )
    if (sample.bitRate !== undefined) {
      t.is(metadata.bitRate, sample.bitRate, 'bitrate')
    } else {
      t.ok(Number.isFinite(metadata.bitRate) && metadata.bitRate >= 0, 'bitrate')
    }
  })
}
