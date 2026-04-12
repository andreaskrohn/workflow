import pino from 'pino'
import path from 'path'

const isTest = process.env['NODE_ENV'] === 'test'

const logger = pino({
  level: isTest ? 'silent' : (process.env['LOG_LEVEL'] ?? 'info'),
  ...(isTest
    ? {}
    : {
        transport: {
          target: 'pino-roll',
          options: {
            file: path.join('logs', 'app.log'),
            size: '50m',
            mkdir: true,
          },
        },
      }),
})

export default logger
