import env from '#start/env'
import { defineConfig } from '@adonisjs/core/http'

export default {
  appKey: env.get('APP_KEY'),

  http: defineConfig({
    generateRequestId: true,
    allowMethodSpoofing: false,
    useAsyncLocalStorage: false,
    cookie: {},
  }),
}
