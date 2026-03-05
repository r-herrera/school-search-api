import type { HttpContext } from '@adonisjs/core/http'
import InstitutionRepository from '#repositories/institution_repository'

export default class ExplainController {
  private repo = new InstitutionRepository()

  /**
   * Get EXPLAIN ANALYZE for a specific query type and region
   * GET /api/explain/:region?q=university&type=ilike
   */
  async analyzeRegion({ request, response, params }: HttpContext) {
    const region = params.region || 'us'
    const term = request.input('q', 'university')
    const queryType = request.input('type', 'ilike')

    const validTypes = ['like', 'ilike', 'tsvector', 'trgm']
    if (!validTypes.includes(queryType)) {
      return response.badRequest({ error: `Invalid query type. Must be one of: ${validTypes.join(', ')}` })
    }

    const explain = await this.repo.getExplainForRegion(region, term, queryType)
    return response.json(explain)
  }

  /**
   * Compare EXPLAIN outputs across all search methods
   * GET /api/explain/compare?q=university
   */
  async compareAll({ request, response }: HttpContext) {
    const term = request.input('q', 'university')
    const region = request.input('region', 'us')

    const [like, ilike, tsvector, trgm] = await Promise.all([
      this.repo.getExplainForRegion(region, term, 'like'),
      this.repo.getExplainForRegion(region, term, 'ilike'),
      this.repo.getExplainForRegion(region, term, 'tsvector'),
      this.repo.getExplainForRegion(region, term, 'trgm'),
    ])

    return response.json({
      search_term: term,
      region,
      explain_results: {
        like,
        ilike,
        tsvector,
        trgm,
      },
    })
  }

  /**
   * Get raw EXPLAIN ANALYZE output for custom SQL
   * POST /api/explain/raw
   * Body: { sql: "SELECT ...", params: [...] }
   */
  async analyzeRaw({ request, response }: HttpContext) {
    const { sql, params = [] } = request.body()

    if (!sql) {
      return response.badRequest({ error: 'Missing SQL query' })
    }

    // Security check - only allow SELECT statements
    const normalizedSql = sql.trim().toLowerCase()
    if (!normalizedSql.startsWith('select')) {
      return response.badRequest({ error: 'Only SELECT queries are allowed' })
    }

    try {
      const { default: db } = await import('@adonisjs/lucid/services/db')
      const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`
      const result = await db.rawQuery(explainSql, params)
      
      return response.json({
        sql,
        params,
        explain: result.rows[0]['QUERY PLAN'],
      })
    } catch (error) {
      return response.internalServerError({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
