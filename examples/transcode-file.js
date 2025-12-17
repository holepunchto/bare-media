import { promises as fs } from 'bare-fs'
import path from 'bare-path'
import process from 'bare-process'
import b4a from 'b4a'
import { transcode } from '../worker/media.js'

async function runTranscodeExample() {
  const inputFilePath = path.join(process.cwd(), 'test', 'fixtures', 'sample.mp4')
  const outputFilePath = path.join(process.cwd(), 'examples', 'output.mp4')
  const inputBuffer = await fs.readFile(inputFilePath)

  console.log(`Starting transcoding of ${inputFilePath} to ${outputFilePath}`)

  const outputChunks = []

  // Create a mock stream object that mimics the hypercore protocol stream
  const mockStream = {
    data: {
      buffer: inputBuffer,
      outputParameters: {
        format: 'mp4'
      }
    },
    write(chunk) {
      // In a real hypercore protocol stream, this would send data over the network
      outputChunks.push(chunk.buffer)
    },
    end() {
      console.log('Transcoding finished and output stream ended.')
    }
  }

  try {
    await transcode(mockStream)
    const finalBuffer = b4a.concat(outputChunks)
    console.log(`Total bytes written: ${finalBuffer.byteLength}`)
    await fs.writeFile(outputFilePath, finalBuffer)
    console.log(`Successfully transcoded to ${outputFilePath}`)
  } catch (error) {
    console.error('Transcoding failed:', error)
  }
}

runTranscodeExample()
