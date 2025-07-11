import path from 'path'

export function spawn (sourcePath) {
  const normalized = path.normalize(sourcePath)
  const link = Pear.key ? `${Pear.config.applink}/${normalized}` : path.join(Pear.config.dir, ...normalized.split('/'))
  return Pear.worker.run(link)
}
