import env from '#start/env'
import { defineConfig, targets } from '@adonisjs/core/logger'
import type { InferLoggers } from '@adonisjs/core/types'

const loggerConfig = defineConfig({
  default: 'app',

  loggers: {
    app: {
      enabled: true,
      name: 'adonisjs',
      level: env.get('LOG_LEVEL'),
      transport: {
        targets: targets()
          .push(targets.pretty({ colorize: true }))
          .toArray(),
      },
    },
  },
})

export default loggerConfig

declare module '@adonisjs/core/types' {
  interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
