import { promises as fs } from 'bare-fs'
import path from 'bare-path'
import process from 'bare-process'

import b4a from 'b4a'

import { video } from '../index.js'

async function transcodeFile(inputFile, outputFile, opts) {
  const inputFilePath = path.join(process.cwd(), 'test', 'fixtures', inputFile)
  const outputFilePath = path.join(process.cwd(), 'examples', outputFile)

  const inputStats = await fs.stat(inputFilePath)
  console.log(`\nTranscoding: ${inputFile} -> ${outputFile}`)
  console.log(`  Input size: ${(inputStats.size / 1024).toFixed(2)} KB`)
  console.log(`  Output format: ${opts.format}`)
  if (opts.width || opts.height) {
    console.log(`  Resolution: ${opts.width}x${opts.height}`)
  }

  const outputChunks = []
  const startTime = Date.now()

  try {
    for await (const chunk of video(inputFilePath).transcode(opts)) {
      outputChunks.push(chunk.buffer)
    }

    const duration = Date.now() - startTime
    console.log(`  Completed in ${duration}ms`)

    const finalBuffer = b4a.concat(outputChunks)
    console.log(`  Output size: ${(finalBuffer.byteLength / 1024).toFixed(2)} KB`)
    await fs.writeFile(outputFilePath, finalBuffer)
    console.log(`  ✓ Saved to ${outputFilePath}`)
  } catch (error) {
    console.error(`  ✗ Transcoding failed: ${error.message}`)
    throw error
  }
}

async function runTranscodeExamples() {
  console.log('=== bare-media Transcode Examples ===')
  console.log('Testing all supported video format conversions...\n')

  try {
    await transcodeFile('sample.webm', 'output-webm-to-mp4.mp4', {
      format: 'mp4',
      width: 1280,
      height: 720
    })

    await transcodeFile('sample.mp4', 'output-mp4-to-webm.webm', {
      format: 'webm'
    })

    await transcodeFile('sample.mkv', 'output-mkv-to-mp4.mp4', {
      format: 'mp4',
      width: 320,
      height: 240
    })

    await transcodeFile('sample.mp4', 'output-mp4-to-matroska.mkv', {
      format: 'matroska',
      width: 320,
      height: 240
    })

    await transcodeFile('sample.mp4', 'output-mp4-downscaled.mp4', {
      format: 'mp4',
      width: 160,
      height: 120
    })

    console.log('\n=== All transcoding examples completed successfully! ===')
    console.log('\nOutput files created in examples/ directory:')
    console.log('  - output-webm-to-mp4.mp4')
    console.log('  - output-mp4-to-webm.webm')
    console.log('  - output-mkv-to-mp4.mp4')
    console.log('  - output-mp4-to-matroska.mkv')
    console.log('  - output-mp4-downscaled.mp4')
  } catch (error) {
    console.error('\n=== Transcoding examples failed ===')
    console.error(error)
    process.exit(1)
  }
}

runTranscodeExamples()
