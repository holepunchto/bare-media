export async function spawn ({ sourcePath }) {
  sourcePath = sourcePath.replace(/^[\\|/]/, '')

  const link = Pear.key
    ? `${Pear.config.applink}/${sourcePath}`
    : `${Pear.config.dir}${sourcePath}`

  return {
    IPC: Pear.worker.run(link)
  }
}
