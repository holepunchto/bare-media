// Parse the parts of a display matrix that affect orientation.
//
// A display matrix is normally applied to each pixel to determine how a frame
// should be presented. Here we only need to extract the orientation we expose
// in our metadata model: {rotation, flipH, flipV}.
//
export function parseDisplayMatrix(matrix) {
  const a = snap(matrix.readInt32LE(0) / 65536)
  const b = snap(matrix.readInt32LE(4) / 65536)
  const c = snap(matrix.readInt32LE(12) / 65536)
  const d = snap(matrix.readInt32LE(16) / 65536)

  let rotation = 0
  let flipH = false
  let flipV = false

  const det = a * d - b * c

  if (det > 0) {
    // rotation only
    if (a === 1 && d === 1) rotation = 0
    else if (b === -1 && c === 1) rotation = 90
    else if (a === -1 && d === -1) rotation = 180
    else if (b === 1 && c === -1) rotation = 270
  } else {
    // reflection present
    if (a === -1 && d === 1) {
      flipH = true
    } else if (a === 1 && d === -1) {
      flipV = true
    } else if (b === 1 && c === 1) {
      rotation = 90
      flipH = true
    } else if (b === -1 && c === -1) {
      rotation = 90
      flipV = true
    }
  }

  return { rotation, flipH, flipV }
}

function snap(value, epsilon = 1e-3) {
  if (Math.abs(value - 1) < epsilon) return 1
  if (Math.abs(value + 1) < epsilon) return -1
  if (Math.abs(value) < epsilon) return 0
  return value
}
