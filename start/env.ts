import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
  APP_KEY: Env.schema.string(),

  // Database
  DB_CONNECTION: Env.schema.string(),
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),
  
  // Region configuration
  DB_REGION: Env.schema.enum(['us', 'china', 'eu'] as const),
  DB_IS_MASTER: Env.schema.string.optional(),
  
  // Option type: raw_fdw, materialized_view, eu_master_fdw
  OPTION_TYPE: Env.schema.enum(['raw_fdw', 'materialized_view', 'eu_master_fdw'] as const),
  
  // Multi-region hosts (for Option 1 & 2)
  US_DB_HOST: Env.schema.string.optional(),
  CHINA_DB_HOST: Env.schema.string.optional(),
  EU_DB_HOST: Env.schema.string.optional(),
  
  // EU Master host (for Option 3)
  EU_MASTER_HOST: Env.schema.string.optional(),
})
