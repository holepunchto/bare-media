import path from 'path'
import pkg from '../../package.json' with { type: 'json' }

export async function spawn () {
  const workerPath = `node_modules/${pkg.name}/worker/index.js`

  const link = Pear.key
    ? `${Pear.config.applink}/${workerPath}`
    : path.join(Pear.config.dir, ...workerPath.split('/'))

  return {
    IPC: Pear.worker.run(link)
  }
}
