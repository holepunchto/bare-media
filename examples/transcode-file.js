import { promises as fs } from 'bare-fs'
import path from 'bare-path'
import process from 'bare-process'
import b4a from 'b4a'
import { transcode } from '../worker/media.js'

async function transcodeFile(inputFile, outputFile, outputFormat) {
  const inputFilePath = path.join(process.cwd(), 'test', 'fixtures', inputFile)
  const outputFilePath = path.join(process.cwd(), 'examples', outputFile)
  const inputBuffer = await fs.readFile(inputFilePath)

  console.log(`\nStarting transcoding: ${inputFile} -> ${outputFile} (${outputFormat})`)

  const outputChunks = []

  // Create a mock stream object that mimics the hypercore protocol stream
  const mockStream = {
    data: {
      buffer: inputBuffer,
      outputParameters: {
        format: outputFormat
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
    throw error
  }
}

async function runTranscodeExamples() {
  console.log('=== Transcode Examples ===')

  // Example 1: MP4 to WebM
  await transcodeFile('sample.mp4', 'output-mp4-to-webm.webm', 'webm')

  // Example 2: WebM to MP4
  await transcodeFile('sample.webm', 'output-webm-to-mp4.mp4', 'mp4')

  console.log('\n=== All transcoding examples completed successfully! ===')
}

runTranscodeExamples()
