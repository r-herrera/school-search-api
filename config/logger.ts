import env from '#start/env'
import { defineConfig, targets, type Logger } from '@adonisjs/core/logger'

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
  export interface ContainerBindings {
    logger: Logger<typeof loggerConfig>
  }
}
