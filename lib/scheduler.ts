import cron from 'node-cron'
import { spawn } from 'child_process'
import path from 'path'

// Singleton guard — in Next.js dev mode modules can be re-evaluated on hot
// reload; the global variable persists across re-evaluations so the cron job
// is only registered once per process.
declare global {
  // eslint-disable-next-line no-var
  var schedulerInitialized: boolean | undefined
}

if (!global.schedulerInitialized) {
  global.schedulerInitialized = true

  // Daily backup at 23:00.
  cron.schedule('0 23 * * *', () => {
    spawn('bash', [path.join(process.cwd(), 'scripts', 'backup.sh')], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  })
}
