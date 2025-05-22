import path from 'path'

export function spawnWorker (sourcePath) {
  if (false) {
    return mobile(sourcePath)
  }
  return desktop(sourcePath)
}

function desktop (sourcePath) {
  const normalized = path.normalize(sourcePath)
  const link = Pear.key ? `${Pear.config.link}/${normalized}` : path.join(Pear.config.dir, ...normalized.split('/'))
  return Pear.worker.run(link)
}

async function mobile (sourcePath) {
  const { Worklet } = await import('react-native-bare-kit')
  // TODO
}
