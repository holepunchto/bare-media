import { createReadStream } from 'bare-fs'
import { access, readdir, readFile } from 'bare-fs/promises'
import { createHash } from 'bare-crypto'
import { join } from 'bare-path'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import { decode } from 'hypercore-id-encoding'
import Hyperswarm from 'hyperswarm'
import Localdrive from 'localdrive'

const key = 'qm5bc1h7ooaeiiiagzaiiq7qh5ecs9ob1ufm98qr8zwsg7rauabo'
const samplesDir = join('test', 'samples')

export default async function main() {
  if (await download()) {
    await verify()
  }
}

async function download() {
  const filesDir = join(samplesDir, 'files')

  if (await exists(filesDir)) return false

  const store = new Corestore(join('node_modules', '.cache', 'hyperdrive'))
  const drive = new Hyperdrive(store, decode(key))
  const local = new Localdrive(filesDir)
  const swarm = new Hyperswarm()

  swarm.on('connection', (socket) => store.replicate(socket))

  try {
    await drive.ready()
    swarm.join(drive.discoveryKey)
    const done = store.findingPeers()
    swarm.flush().then(done, done)
    const mirror = drive.mirror(local)
    await mirror.done()
    console.log(`Downloaded ${mirror.count.files} sample files`)
  } finally {
    await swarm.destroy()
    await store.close()
  }

  return true
}

async function exists(filename) {
  try {
    await access(filename)
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

async function verify() {
  const suitesDir = join(samplesDir, 'suites')
  let verified = 0

  for (const suiteFile of (await readdir(suitesDir)).sort()) {
    if (!suiteFile.endsWith('.json')) continue

    const suite = JSON.parse(await readFile(join(suitesDir, suiteFile), 'utf8'))
    if (!suite.catalog) continue

    for (const sample of suite.catalog.samples || []) {
      const filename = join(samplesDir, suite.catalog.path, sample.path)
      const actual = await sha256(filename)

      if (actual !== sample.sha256) {
        throw new Error(`${filename}: expected ${sample.sha256}, got ${actual}`)
      }

      verified++
    }
  }

  console.log(`Verified ${verified} sample files`)
}

async function sha256(filename) {
  const hash = createHash('sha256')

  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}
