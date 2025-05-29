import { spawn as pearSpawn } from './pear.js'
import { spawn as bareKitSpawn } from './bare-kit.js'

// TODO
const isPear = true
const isBareKit = false

export function spawn (sourcePath) {
  if (isPear) {
    return pearSpawn(sourcePath)
  } else if (isBareKit) {
    return bareKitSpawn(sourcePath)
  }
}
