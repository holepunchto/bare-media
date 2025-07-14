const isPear = typeof Pear !== 'undefined'

export async function spawn (opts) {
  const lib = isPear
    ? await import('./pear')
    : await import('./bare-kit')

  return lib.spawn(opts)
}
