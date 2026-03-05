import type { HttpContext } from '@adonisjs/core/http'
import InstitutionRepository from '#repositories/institution_repository'
import env from '#start/env'

export default class MvController {
  private repo = new InstitutionRepository()

  /**
   * Check if materialized view operations are enabled
   */
  private checkMvEnabled(response: HttpContext['response']) {
    const optionType = env.get('OPTION_TYPE', 'raw_fdw')
    if (optionType !== 'materialized_view') {
      response.badRequest({
        error: 'Materialized view operations are only available in Option 2 (materialized_view)',
        current_option: optionType,
      })
      return false
    }
    return true
  }

  /**
   * Refresh materialized view (blocking)
   * POST /api/mv/refresh
   */
  async refresh({ response }: HttpContext) {
    if (!this.checkMvEnabled(response)) return

    try {
      const result = await this.repo.refreshMv()
      return response.json({
        success: true,
        message: 'Materialized view refreshed successfully (blocking)',
        ...result,
      })
    } catch (error) {
      return response.internalServerError({
        error: 'Failed to refresh materialized view',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Refresh materialized view concurrently (non-blocking)
   * POST /api/mv/refresh-concurrent
   */
  async refreshConcurrent({ response }: HttpContext) {
    if (!this.checkMvEnabled(response)) return

    try {
      const result = await this.repo.refreshMvConcurrent()
      return response.json({
        success: true,
        message: 'Materialized view refreshed concurrently (non-blocking)',
        ...result,
      })
    } catch (error) {
      return response.internalServerError({
        error: 'Failed to refresh materialized view concurrently',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Get materialized view status
   * GET /api/mv/status
   */
  async status({ response }: HttpContext) {
    if (!this.checkMvEnabled(response)) return

    try {
      const result = await this.repo.getMvStatus()
      return response.json(result)
    } catch (error) {
      return response.internalServerError({
        error: 'Failed to get materialized view status',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Compare refresh methods
   * POST /api/mv/compare-refresh
   */
  async compareRefresh({ response }: HttpContext) {
    if (!this.checkMvEnabled(response)) return

    try {
      // First, do a blocking refresh
      const blockingResult = await this.repo.refreshMv()
      
      // Then a concurrent refresh
      const concurrentResult = await this.repo.refreshMvConcurrent()

      return response.json({
        comparison: {
          blocking: {
            duration_ms: blockingResult.metrics.duration_ms,
            description: 'Locks table during refresh, readers blocked',
          },
          concurrent: {
            duration_ms: concurrentResult.metrics.duration_ms,
            description: 'Uses more resources but allows reads during refresh',
          },
          difference_ms: blockingResult.metrics.duration_ms - concurrentResult.metrics.duration_ms,
          recommendation: concurrentResult.metrics.duration_ms < blockingResult.metrics.duration_ms * 2
            ? 'concurrent'
            : 'blocking',
        },
        full_results: {
          blocking: blockingResult,
          concurrent: concurrentResult,
        },
      })
    } catch (error) {
      return response.internalServerError({
        error: 'Failed to compare refresh methods',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
