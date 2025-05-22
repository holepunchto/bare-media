import fs from 'bare-fs'
import { COMMAND } from './command-code'

export const HANDLER_MAP = {
  [COMMAND.HEIC_TO_JPG]: heicToJpg
}

async function heicToJpg (req) {
  const heif = await import('bare-heif')
  const jpeg = await import('bare-jpeg')

  const path = req.data.toString('utf-8')
  const heicBuffer = fs.readFileSync(path)

  const rgbaImage = heif.decode(heicBuffer)
  return jpeg.encode(rgbaImage)
}
