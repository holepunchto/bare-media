import process from 'bare-process'

import { image } from '../..'
import benchmark from '../benchmark'

const filename = process.argv[2]
const rgba = await image(filename).decode()

await benchmark(() => image.resize(rgba, { maxWidth: 64, maxHeight: 64 }))
