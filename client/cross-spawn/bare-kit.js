const { Worklet } = require('react-native-bare-kit')

export const spawn = async ({ requireSource, storagePath, buildVariant, deviceId, devMode }) => {
  const source = requireSource()

  const worklet = new Worklet()

  await worklet.start('keet:/main.bundle', source, [
    storagePath,
    buildVariant,
    deviceId,
    devMode
  ])

  return worklet
}
