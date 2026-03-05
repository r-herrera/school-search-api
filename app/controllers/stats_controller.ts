import type { HttpContext } from '@adonisjs/core/http'
import InstitutionRepository from '#repositories/institution_repository'
import env from '#start/env'

export default class StatsController {
  private repo = new InstitutionRepository()

  /**
   * Get region statistics
   * GET /api/stats/regions
   */
  async regions({ response }: HttpContext) {
    const result = await this.repo.getRegionStats()
    return response.json(result)
  }

  /**
   * Get summary statistics
   * GET /api/stats/summary
   */
  async summary({ response }: HttpContext) {
    const result = await this.repo.getSummaryStats()
    return response.json(result)
  }

  /**
   * Get current configuration info
   * GET /api/stats/config
   */
  async config({ response }: HttpContext) {
    const config = {
      option_type: env.get('OPTION_TYPE', 'raw_fdw'),
      region: env.get('DB_REGION', 'us'),
      is_master: env.get('DB_IS_MASTER', 'false') === 'true',
      database: {
        host: env.get('DB_HOST', 'localhost'),
        port: env.get('DB_PORT', 5432),
        database: env.get('DB_DATABASE', 'institutions'),
      },
      api: {
        host: env.get('HOST', '0.0.0.0'),
        port: env.get('PORT', 3333),
      },
    }

    return response.json(config)
  }

  /**
   * Health check endpoint
   * GET /api/health
   */
  async health({ response }: HttpContext) {
    try {
      const { default: db } = await import('@adonisjs/lucid/services/db')
      const result = await db.rawQuery('SELECT 1 as ok')
      
      return response.json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
        option_type: env.get('OPTION_TYPE', 'raw_fdw'),
        region: env.get('DB_REGION', 'us'),
      })
    } catch (error) {
      return response.serviceUnavailable({
        status: 'unhealthy',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Get all statistics combined
   * GET /api/stats
   */
  async all({ response }: HttpContext) {
    const [regions, summary] = await Promise.all([
      this.repo.getRegionStats(),
      this.repo.getSummaryStats(),
    ])

    return response.json({
      option_type: env.get('OPTION_TYPE', 'raw_fdw'),
      region: env.get('DB_REGION', 'us'),
      is_master: env.get('DB_IS_MASTER', 'false') === 'true',
      regions: regions.results,
      summary: summary.results,
      metrics: {
        regions_query: regions.metrics,
        summary_query: summary.metrics,
      },
    })
  }
}
