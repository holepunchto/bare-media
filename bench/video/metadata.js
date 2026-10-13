import process from 'bare-process'

import { video } from '../..'
import benchmark from '../benchmark'

const filename = process.argv[2]

await benchmark(() => video(filename).metadata())
