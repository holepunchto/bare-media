import process from 'bare-process'

import { image } from '../..'
import benchmark from '../benchmark'

const filename = process.argv[2]
const rgba = await image(filename).decode()

await benchmark(() =>
  image.crop(rgba, {
    left: 0,
    top: 0,
    width: Math.floor(rgba.width / 2),
    height: Math.floor(rgba.height / 2)
  })
)
