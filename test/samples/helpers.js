import { join } from 'bare-path'
import { fileURLToPath } from 'bare-url'

export function samplePath(catalog, path) {
  const sample = catalog.samples.find((sample) => sample.path === path)
  if (!sample) throw new Error(`Unknown sample path: ${path}`)
  const abs = fileURLToPath(new URL('.', import.meta.url))
  return join(abs, catalog.path, sample.path)
}
