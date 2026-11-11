import process from 'bare-process'

import { image } from '../..'
import benchmark from '../benchmark'

const filename = process.argv[2]

await benchmark(() => image(filename).decode())
