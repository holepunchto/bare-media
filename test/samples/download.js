import { createReadStream } from 'bare-fs'
import { mkdir, open, readdir, readFile, rename, stat, unlink } from 'bare-fs/promises'
import path from 'bare-path'
import process from 'bare-process'
import fetch from 'bare-fetch'
import { createHash } from 'bare-crypto'

await main()

async function main() {
  const samples = await loadSamples()
  const outputDir = path.resolve('test/samples/files')

  await mkdir(outputDir, { recursive: true })

  for (const sample of samples) {
    await download(sample, outputDir)
  }

  console.log(`Samples ready: ${samples.length} files in ${outputDir}`)
}

async function loadSamples() {
  const suitesDir = path.resolve('test/samples/suites')
  const samples = []

  for (const filename of (await readdir(suitesDir)).sort()) {
    if (!filename.endsWith('.json')) continue

    const suite = JSON.parse(await readFile(path.join(suitesDir, filename), 'utf8'))
    if (!suite.catalog) continue

    for (const sample of suite.catalog.samples || []) {
      if (!sample.id || !sample.source || !sample.path) {
        throw new Error('Every sample needs an id, source, and path')
      }

      const baseUrl = suite.catalog.sources?.[sample.source]?.baseUrl
      if (!baseUrl) throw new Error(`Unknown source for ${sample.id}: ${sample.source}`)
      if (!/^[a-f0-9]{64}$/.test(sample.sha256)) {
        throw new Error(`${sample.id} needs a lowercase SHA-256 checksum`)
      }

      samples.push({ ...sample, baseUrl })
    }
  }

  return samples
}

async function download(sample, outputDir) {
  const relativePath = `${sample.source}/${sample.path}`
  const destination = safeDestination(outputDir, relativePath)

  await mkdir(path.dirname(destination), { recursive: true })

  if ((await exists(destination)) && (await sha256(destination)) === sample.sha256) {
    console.log(`Cached ${sample.id}`)
    return
  }

  const url = appendPath(sample.baseUrl, sample.path)
  const temporary = `${destination}.download-${process.pid}-${Math.random().toString(16).slice(2)}`

  console.log(`Downloading ${sample.id}`)

  try {
    const response = await fetch(url)
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    const file = await open(temporary, 'w')
    try {
      for await (const chunk of response.body) {
        await file.write(chunk)
      }
    } finally {
      await file.close()
    }

    const actual = await sha256(temporary)
    if (actual !== sample.sha256) {
      throw new Error(`SHA-256 mismatch: expected ${sample.sha256}, got ${actual}`)
    }

    if (await exists(destination)) await unlink(destination)
    await rename(temporary, destination)
  } catch (error) {
    if (await exists(temporary)) await unlink(temporary)
    throw new Error(`Could not download ${url}: ${error.message}`, { cause: error })
  }
}

function safeDestination(directory, relativePath) {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error(`Unsafe sample path: ${relativePath}`)
  }

  const destination = path.resolve(directory, relativePath)
  if (destination === directory || !destination.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`Unsafe sample path: ${relativePath}`)
  }

  return destination
}

function appendPath(root, relativePath) {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
  return new URL(encodedPath, root.endsWith('/') ? root : `${root}/`).href
}

async function exists(filename) {
  try {
    await stat(filename)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function sha256(filename) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}
