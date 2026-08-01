import process from 'bare-process'

if (process.argv.includes('--download')) {
  await import('./download.js')
} else {
  await import('./image.js')
  await import('./video.js')
}
