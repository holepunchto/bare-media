import RPC from 'bare-rpc'
import uncaughts from 'uncaughts'
import { HANDLER_MAP } from './command-handler'
import { log } from './log'

log('Started')

const pipe = Pear.worker.pipe()

async function onRequest (req) {
  const { command } = req
  const handler = HANDLER_MAP[command]
  const result = await handler(req)
  req.reply(result)
}

// eslint-disable-next-line no-unused-vars
const rpc = new RPC(pipe, onRequest)

pipe.on('end', () => pipe.end())
pipe.on('error', (err) => console.error(err))
pipe.on('close', () => Bare.exit(0))

uncaughts.on((err) => {
  log('Uncaught error:', err)
})
