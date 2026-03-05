import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  typescript: true,
  directories: {
    controllers: 'app/controllers',
    services: 'app/services',
    repositories: 'app/repositories',
  },
  preloads: [
    () => import('#start/routes'),
    () => import('#start/kernel'),
  ],
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/vinejs_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/cors/cors_provider'),
  ],
  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
  ],
})
