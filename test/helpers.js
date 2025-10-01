export function isAnimatedWebP(buffer) {
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return false
  }

  let offset = 12
  while (offset < buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const payloadSize = buffer.readUInt32LE(offset + 4)

    if (chunkId === 'VP8X') {
      const flags = buffer[offset + 8]
      return (flags & 0x02) !== 0
    }

    // 4 + 4 + payload size + even padding
    offset += 8 + payloadSize + (payloadSize % 2)
  }

  return false
}
