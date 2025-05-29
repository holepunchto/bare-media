import worker from 'cross-worker'
import RPC from 'bare-rpc'
import uncaughts from 'uncaughts'
import { HANDLER_MAP } from './command-handler'
import { log } from './log'

log('Worker started 🚀')

const stream = worker.stream()

async function onRequest (req) {
  const { command } = req
  const handler = HANDLER_MAP[command]
  const result = await handler(req)
  req.reply(result)
}

// eslint-disable-next-line no-unused-vars
const rpc = new RPC(stream, onRequest)

stream.on('end', () => stream.end())
stream.on('error', (err) => console.error(err))
stream.on('close', () => Bare.exit(0))

uncaughts.on((err) => {
  log('Uncaught error:', err)
})
