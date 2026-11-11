import performance from 'bare-performance'
import process from 'bare-process'

export default async function benchmark(run) {
  const rssBefore = getRss()
  const cpuBefore = process.cpuUsage()
  const start = performance.now()

  const resultKeptFromGC = await run()

  const ms = performance.now() - start
  const cpu = process.cpuUsage(cpuBefore)
  const cpuMs = (cpu.user + cpu.system) / 1000
  const rssAfter = getRss()
  const rssMax = getRssMax()

  console.log(
    JSON.stringify({
      ms,
      cpuMs,
      cpuPercent: (cpuMs / ms) * 100,
      rssBefore,
      rssAfter,
      rssMax,
      rssDiff: rssAfter - rssBefore
    })
  )

  return resultKeptFromGC
}

function getRss() {
  return process.memoryUsage().rss
}

function getRssMax() {
  return process.resourceUsage().maxRSS * 1024
}
