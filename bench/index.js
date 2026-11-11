import { readdir } from 'bare-fs/promises'
import { fileURLToPath } from 'bare-url'
import { join } from 'bare-path'
import process from 'bare-process'
import { spawnSync } from 'bare-subprocess'
import getMimeType from 'get-mime-type'

import downloadSamples from '../test/samples/download'

const abs = fileURLToPath(new URL('..', import.meta.url))
const samplesDir = join(abs, 'test', 'samples', 'files', 'benchmark')
const suites = [
  {
    name: 'Image',
    directory: 'image',
    benchmarks: ['decode', 'resize', 'crop', 'rotate', 'flip', 'encode'],
    mimetype: 'image/'
  },
  {
    name: 'Video',
    directory: 'video',
    benchmarks: ['metadata', 'extract-frames', 'transcode'],
    mimetype: 'video/'
  }
]

await downloadSamples()

const samples = (await readdir(samplesDir)).filter((name) => !name.startsWith('.')).sort()

for (const suite of suites) {
  const media = samples.filter((sample) => getMimeType(sample)?.startsWith(suite.mimetype))
  if (media.length === 0) continue

  console.log(`${suite.name} benchmark time, CPU, RSS diff, and max RSS`)

  for (const benchmark of suite.benchmarks) {
    console.log(`\n${benchmark}`)

    for (const sample of media) {
      const child = spawnSync(
        process.execPath,
        [join('bench', suite.directory, `${benchmark}.js`), join(samplesDir, sample)],
        {
          cwd: process.cwd(),
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )

      if (child.status !== 0) throw new Error(child.stderr.toString())

      printResult(sample, JSON.parse(child.stdout.toString()))
    }
  }

  console.log()
}

function printResult(sample, result) {
  console.log(
    `${sample.padEnd(16)} ${result.ms.toFixed(2).padStart(8)} ms  ${result.cpuMs.toFixed(2).padStart(8)} ms CPU (${result.cpuPercent.toFixed(1)}%)  ${formatRssDiff(result.rssDiff).padStart(10)}  ${formatBytes(result.rssMax).padStart(10)} max`
  )
}

function formatRssDiff(bytes) {
  const sign = bytes >= 0 ? '+' : '-'
  return `${sign}${formatBytes(Math.abs(bytes))}`
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
