import path from 'path'

export async function spawn ({ sourcePath }) {
  const link = Pear.key
    ? `${Pear.config.applink}/${sourcePath}`
    : path.join(Pear.config.dir, ...sourcePath.split('/'))

  return {
    IPC: Pear.worker.run(link)
  }
}
