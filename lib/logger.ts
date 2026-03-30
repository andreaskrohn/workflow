import pino from 'pino'
import path from 'path'

const logger = pino({
  transport: {
    target: 'pino-roll',
    options: {
      file: path.join('logs', 'app.log'),
      size: '50m',
      mkdir: true,
    },
  },
})

export default logger
