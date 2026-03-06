import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import MetricsService from '#services/metrics_service'
import type {
  Institution,
  InstitutionFilters,
  QueryMetrics,
  SearchResult,
  PaginatedResult,
  RegionStats,
  MvStatus,
} from '#types/institution'

/**
 * Repository for Institution database operations
 * Supports all three options: Raw FDW, Materialized View, EU Master FDW
 */
export default class InstitutionRepository {
  private metricsService = new MetricsService()

  /**
   * Get option type from environment
   */
  private getOptionType(): string {
    return env.get('OPTION_TYPE', 'raw_fdw')
  }

  /**
   * Check if connected to master database
   */
  private isMaster(): boolean {
    return env.get('DB_IS_MASTER', 'false') === 'true'
  }

  /**
   * Get the current region
   */
  private getRegion(): string {
    return env.get('DB_REGION', 'us')
  }

  /**
   * Get the appropriate table name based on option type
   */
  private getTableName(): string {
    const optionType = this.getOptionType()
    
    switch (optionType) {
      case 'materialized_view':
        return 'institutions_mv'
      case 'eu_master_fdw':
        return 'foreign_eu.institutions'
      case 'raw_fdw':
      default:
        return 'institutions'
    }
  }

  /**
   * Build connection info for metrics
   */
  private getConnectionInfo() {
    return {
      is_master: this.isMaster(),
      region: this.getRegion(),
      table_used: this.getTableName(),
    }
  }

  /**
   * Get the foreign table names for cross-region queries (raw_fdw only).
   * Returns the local table + foreign tables based on which region we're connected to.
   */
  private getAllRegionTables(): string[] {
    const optionType = this.getOptionType()
    if (optionType !== 'raw_fdw') {
      return [this.getTableName()]
    }

    const region = this.getRegion()
    if (region === 'eu') {
      return ['institutions', 'foreign_us.institutions', 'foreign_china.institutions']
    } else if (region === 'us') {
      return ['institutions', 'foreign_eu.institutions', 'foreign_china.institutions']
    } else {
      // china
      return ['institutions', 'foreign_us.institutions', 'foreign_eu.institutions']
    }
  }

  // ==========================================
  // SEARCH METHODS
  // ==========================================

  /**
   * Search with LIKE (case-sensitive)
   */
  async searchWithLike(term: string, limit: number = 50): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()
    const pattern = `%${term}%`

    const sql = `
      SELECT * FROM ${tableName}
      WHERE organisation_name LIKE ?
         OR city LIKE ?
         OR country LIKE ?
      ORDER BY organisation_name ASC
      LIMIT ?
    `

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, [pattern, pattern, pattern, limit])
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [pattern, pattern, pattern, limit])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'LIKE',
      term
    )

    return { results: result.rows, metrics }
  }

  /**
   * Search with ILIKE (case-insensitive)
   */
  async searchWithIlike(term: string, limit: number = 50): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()
    const pattern = `%${term}%`

    const sql = `
      SELECT * FROM ${tableName}
      WHERE organisation_name ILIKE ?
         OR city ILIKE ?
         OR country ILIKE ?
      ORDER BY organisation_name ASC
      LIMIT ?
    `

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, [pattern, pattern, pattern, limit])
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [pattern, pattern, pattern, limit])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'ILIKE',
      term
    )

    return { results: result.rows, metrics }
  }

  /**
   * Search with tsvector using plainto_tsquery
   */
  async searchWithTsvectorPlainto(term: string, limit: number = 50): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    const sql = `
      SELECT *,
        ts_rank(search_vector, plainto_tsquery('english', ?)) as relevance
      FROM ${tableName}
      WHERE search_vector @@ plainto_tsquery('english', ?)
      ORDER BY relevance DESC, organisation_name ASC
      LIMIT ?
    `

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, [term, term, limit])
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [term, term, limit])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'tsvector_plainto',
      term
    )

    return { results: result.rows, metrics }
  }

  /**
   * Search with tsvector using websearch_to_tsquery (natural language)
   */
  async searchWithTsvectorWebsearch(term: string, limit: number = 50): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    const sql = `
      SELECT *,
        ts_rank(search_vector, websearch_to_tsquery('english', ?)) as relevance
      FROM ${tableName}
      WHERE search_vector @@ websearch_to_tsquery('english', ?)
      ORDER BY relevance DESC, organisation_name ASC
      LIMIT ?
    `

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, [term, term, limit])
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [term, term, limit])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'tsvector_websearch',
      term
    )

    return { results: result.rows, metrics }
  }

  /**
   * Search with pg_trgm similarity
   */
  async searchWithTrgm(term: string, limit: number = 50, threshold: number = 0.3): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    const sql = `
      SELECT *,
        similarity(organisation_name, ?) as sim_score
      FROM ${tableName}
      WHERE organisation_name % ?
         OR city % ?
      ORDER BY sim_score DESC, organisation_name ASC
      LIMIT ?
    `

    // Set similarity threshold (SET doesn't support parameterized queries)
    await db.rawQuery(`SET pg_trgm.similarity_threshold = ${Number(threshold)}`)

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, [term, term, term, limit])
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [term, term, term, limit])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'pg_trgm',
      term
    )

    return { results: result.rows, metrics }
  }

  /**
   * Search with UNION ALL across all regions (Option 1 only)
   */
  async searchUnionAll(term: string, limit: number = 50): Promise<SearchResult> {
    const startTime = performance.now()
    const optionType = this.getOptionType()
    const pattern = `%${term}%`
    const region = this.getRegion()

    let sql: string
    let bindings: any[]
    
    if (optionType === 'raw_fdw') {
      // Option 1: UNION ALL across local + foreign tables
      // The foreign schemas depend on which region we're connected to
      if (region === 'eu') {
        sql = `
          SELECT * FROM (
            SELECT * FROM institutions WHERE organisation_name ILIKE ?
            UNION ALL
            SELECT * FROM foreign_us.institutions WHERE organisation_name ILIKE ?
            UNION ALL
            SELECT * FROM foreign_china.institutions WHERE organisation_name ILIKE ?
          ) combined
          ORDER BY organisation_name ASC
          LIMIT ?
        `
      } else if (region === 'us') {
        sql = `
          SELECT * FROM (
            SELECT * FROM institutions WHERE organisation_name ILIKE ?
            UNION ALL
            SELECT * FROM foreign_eu.institutions WHERE organisation_name ILIKE ?
            UNION ALL
            SELECT * FROM foreign_china.institutions WHERE organisation_name ILIKE ?
          ) combined
          ORDER BY organisation_name ASC
          LIMIT ?
        `
      } else {
        // china
        sql = `
          SELECT * FROM (
            SELECT * FROM institutions WHERE organisation_name ILIKE ?
            UNION ALL
            SELECT * FROM foreign_us.institutions WHERE organisation_name ILIKE ?
            UNION ALL
            SELECT * FROM foreign_eu.institutions WHERE organisation_name ILIKE ?
          ) combined
          ORDER BY organisation_name ASC
          LIMIT ?
        `
      }
      bindings = [pattern, pattern, pattern, limit]
    } else {
      // For other options, just use the main table
      sql = `
        SELECT * FROM ${this.getTableName()}
        WHERE organisation_name ILIKE ?
        ORDER BY organisation_name ASC
        LIMIT ?
      `
      bindings = [pattern, limit]
    }

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, bindings)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, bindings)
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      'union',
      explain,
      this.getConnectionInfo(),
      'UNION_ALL',
      term
    )

    return { results: result.rows, metrics }
  }

  /**
   * Search with JOIN for cross-region relationships
   */
  async searchWithJoin(term: string, limit: number = 50): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()
    const pattern = `%${term}%`

    const sql = `
      SELECT DISTINCT ON (child.id)
        child.*,
        parent.organisation_name as parent_name,
        parent.region as parent_region
      FROM ${tableName} child
      LEFT JOIN ${tableName} parent ON child.parent_centre_number = parent.centre_number
      WHERE child.organisation_name ILIKE ?
      ORDER BY child.id, child.organisation_name ASC
      LIMIT ?
    `

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, [pattern, limit])
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [pattern, limit])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'JOIN',
      term
    )

    return { results: result.rows, metrics }
  }

  // ==========================================
  // PAGINATED SEARCH (Unified endpoint for Frontend)
  // ==========================================

  /**
   * Search with pagination, supporting websearch (tsvector) and trgm (fuzzy) methods.
   * Optionally filters by country and/or city.
   * Returns paginated results with ranking explanation and full EXPLAIN metrics.
   */
 async searchPaginated(
    term: string,
    method: 'websearch' | 'trgm' = 'websearch',
    page: number = 1,
    limit: number = 25,
    filters: { country?: string; city?: string } = {}
  ): Promise<PaginatedResult & { ranking_explanation: string; ranking_technical_detail: string }> {
    const startTime = performance.now()
    const tables = this.getAllRegionTables()
    const offset = (page - 1) * limit

    // Per-branch limit: fetch enough rows from each region so that
    // the global top-(offset+limit) is guaranteed to be present.
    const branchLimit = offset + limit

    // Build optional filter conditions
    const filterConditions: string[] = []
    const filterParams: any[] = []

    if (filters.country) {
      filterConditions.push(`country ILIKE ?`)
      filterParams.push(`%${filters.country}%`)
    }
    if (filters.city) {
      filterConditions.push(`city ILIKE ?`)
      filterParams.push(`%${filters.city}%`)
    }

    const extraWhere = filterConditions.length > 0
      ? ` AND ${filterConditions.join(' AND ')}`
      : ''

    let dataSql: string
    let countSql: string
    let dataParams: any[]
    let countParams: any[]
    let rankingExplanation: string
    let rankingTechnicalDetail: string

    if (method === 'trgm') {
      // pg_trgm fuzzy search across all regions
      await db.rawQuery(`SET pg_trgm.similarity_threshold = 0.3`)

      const whereClause = `WHERE (organisation_name % ? OR city % ?)${extraWhere}`

      // Build UNION ALL for count across all region tables
      const countUnions = tables.map(t =>
        `SELECT 1 FROM ${t} ${whereClause}`
      ).join(' UNION ALL ')
      countSql = `SELECT COUNT(*) as total FROM (${countUnions}) _union`
      countParams = tables.flatMap(() => [term, term, ...filterParams])

      // Build UNION ALL for data with LIMIT PUSHDOWN into each branch
      const dataUnions = tables.map(t =>
        `SELECT * FROM (
          SELECT *, similarity(organisation_name, ?) as relevance
          FROM ${t} ${whereClause}
          ORDER BY similarity(organisation_name, ?) DESC, organisation_name ASC
          LIMIT ?
        ) _${t.replace(/\./g, '_')}`
      ).join(' UNION ALL ')
      dataSql = `
        SELECT * FROM (${dataUnions}) _union
        ORDER BY relevance DESC, organisation_name ASC
        LIMIT ? OFFSET ?
      `
      // Each branch needs: similarity_select_term, where_term1, where_term2, ...filterParams, order_term, branchLimit
      dataParams = tables.flatMap(() => [term, term, term, ...filterParams, term, branchLimit])
      dataParams.push(limit, offset)

      rankingExplanation = `Showing results ranked by how closely each name resembles your search "${term}". ` +
        `This method is forgiving of typos and spelling variations — even approximate matches will appear.`

      rankingTechnicalDetail = `pg_trgm similarity search with threshold 0.3 across ${tables.length} regions (UNION ALL with per-branch LIMIT pushdown). ` +
        `Scores computed via similarity(organisation_name, '${term}'). ` +
        `Uses GIN index (gin_trgm_ops) on organisation_name. Matches on both name and city fields.`
    } else {
      // tsvector websearch (default — best match) across all regions
      const whereClause = `WHERE search_vector @@ websearch_to_tsquery('english', ?)${extraWhere}`

      // Build UNION ALL for count
      const countUnions = tables.map(t =>
        `SELECT 1 FROM ${t} ${whereClause}`
      ).join(' UNION ALL ')
      countSql = `SELECT COUNT(*) as total FROM (${countUnions}) _union`
      countParams = tables.flatMap(() => [term, ...filterParams])

      // Build UNION ALL for data with LIMIT PUSHDOWN into each branch
      const dataUnions = tables.map(t =>
        `SELECT * FROM (
          SELECT *, ts_rank(search_vector, websearch_to_tsquery('english', ?)) as relevance
          FROM ${t} ${whereClause}
          ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', ?)) DESC, organisation_name ASC
          LIMIT ?
        ) _${t.replace(/\./g, '_')}`
      ).join(' UNION ALL ')
      dataSql = `
        SELECT * FROM (${dataUnions}) _union
        ORDER BY relevance DESC, organisation_name ASC
        LIMIT ? OFFSET ?
      `
      // Each branch needs: rank_term, where_term, ...filterParams, order_term, branchLimit
      dataParams = tables.flatMap(() => [term, term, ...filterParams, term, branchLimit])
      dataParams.push(limit, offset)

      rankingExplanation = `Showing the most relevant results for "${term}". ` +
        `Institutions whose names closely match your query appear first. ` +
        `You can use phrases ("state university"), combine terms (college OR school), or exclude words (-private).`

      rankingTechnicalDetail = `Full-text search via websearch_to_tsquery('english', '${term}') with ts_rank scoring across ${tables.length} regions (UNION ALL with per-branch LIMIT pushdown). ` +
        `Uses GIN index on tsvector search_vector column (weighted: A=name, B=city, C=country).`
    }

    // Run count and data queries in parallel
    const [countResult, dataResult] = await Promise.all([
      db.rawQuery<{ rows: { total: string }[] }>(countSql, countParams),
      db.rawQuery<{ rows: Institution[] }>(dataSql, dataParams),
    ])

    const total = parseInt(countResult.rows[0].total, 10)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(dataSql, dataParams)
    const lastPage = Math.max(1, Math.ceil(total / limit))

    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      dataResult.rows.length,
      tables.length > 1 ? 'union' : this.getQuerySource(),
      explain,
      {
        ...this.getConnectionInfo(),
        table_used: tables.length > 1 ? `UNION ALL (${tables.join(', ')})` : tables[0],
      },
      method === 'trgm' ? 'pg_trgm_paginated' : 'websearch_paginated',
      term
    )

    return {
      data: dataResult.rows,
      meta: {
        total,
        per_page: limit,
        current_page: page,
        last_page: lastPage,
        first_page: 1,
        next_page_url: page < lastPage ? `?q=${encodeURIComponent(term)}&method=${method}&page=${page + 1}&limit=${limit}` : null,
        previous_page_url: page > 1 ? `?q=${encodeURIComponent(term)}&method=${method}&page=${page - 1}&limit=${limit}` : null,
      },
      metrics,
      ranking_explanation: rankingExplanation,
      ranking_technical_detail: rankingTechnicalDetail,
    }
  }

  // ==========================================
  // FILTER METHODS
  // ==========================================

  /**
   * Filter by country code
   */
  async filterByCountry(countryCode: string, limit: number = 50): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    const sql = `
      SELECT * FROM ${tableName}
      WHERE country ILIKE ?
      ORDER BY organisation_name ASC
      LIMIT ?
    `

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, [`%${countryCode}%`, limit])
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [`%${countryCode}%`, limit])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'filter_country',
      countryCode
    )

    return { results: result.rows, metrics }
  }

  /**
   * Filter by city
   */
  async filterByCity(city: string, limit: number = 50): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    const sql = `
      SELECT * FROM ${tableName}
      WHERE city ILIKE ?
      ORDER BY organisation_name ASC
      LIMIT ?
    `

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, [`%${city}%`, limit])
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [`%${city}%`, limit])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'filter_city',
      city
    )

    return { results: result.rows, metrics }
  }

  // ==========================================
  // PAGINATION METHODS
  // ==========================================

  /**
   * Paginate with OFFSET
   */
  async paginateWithOffset(page: number = 1, limit: number = 20, filters: InstitutionFilters = {}): Promise<PaginatedResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()
    const offset = (page - 1) * limit

    // Build WHERE clause
    const conditions: string[] = []
    const params: any[] = []

    if (filters.region) {
      conditions.push(`region = ?`)
      params.push(filters.region)
    }
    if (filters.country) {
      conditions.push(`country ILIKE ?`)
      params.push(`%${filters.country}%`)
    }
    if (filters.search) {
      conditions.push(`organisation_name ILIKE ?`)
      params.push(`%${filters.search}%`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`
    const countResult = await db.rawQuery<{ rows: { total: string }[] }>(countSql, params)
    const total = parseInt(countResult.rows[0].total, 10)

    // Get data
    const dataSql = `SELECT * FROM ${tableName} ${whereClause} ORDER BY id ASC LIMIT ? OFFSET ?`
    const dataParams = [...params, limit, offset]
    const dataResult = await db.rawQuery<{ rows: Institution[] }>(dataSql, dataParams)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(dataSql, dataParams)
    const lastPage = Math.ceil(total / limit)

    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      dataResult.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'paginate_offset'
    )

    return {
      data: dataResult.rows,
      meta: {
        total,
        per_page: limit,
        current_page: page,
        last_page: lastPage,
        first_page: 1,
        next_page_url: page < lastPage ? `?page=${page + 1}&limit=${limit}` : null,
        previous_page_url: page > 1 ? `?page=${page - 1}&limit=${limit}` : null,
      },
      metrics,
    }
  }

  /**
   * Paginate with keyset (cursor-based)
   */
  async paginateWithKeyset(lastId: number = 0, limit: number = 20, filters: InstitutionFilters = {}): Promise<PaginatedResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    // Build WHERE clause
    const conditions: string[] = [`id > ?`]
    const params: any[] = [lastId]

    if (filters.region) {
      conditions.push(`region = ?`)
      params.push(filters.region)
    }
    if (filters.country) {
      conditions.push(`country ILIKE ?`)
      params.push(`%${filters.country}%`)
    }
    if (filters.search) {
      conditions.push(`organisation_name ILIKE ?`)
      params.push(`%${filters.search}%`)
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    // Get data
    const dataSql = `SELECT * FROM ${tableName} ${whereClause} ORDER BY id ASC LIMIT ?`
    const dataParams = [...params, limit]
    const dataResult = await db.rawQuery<{ rows: Institution[] }>(dataSql, dataParams)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(dataSql, dataParams)

    // Get next cursor
    const lastRow = dataResult.rows[dataResult.rows.length - 1]
    const nextId = lastRow ? lastRow.id : null

    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      dataResult.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'paginate_keyset'
    )

    return {
      data: dataResult.rows,
      meta: {
        total: -1, // Unknown with keyset pagination
        per_page: limit,
        current_page: -1,
        last_page: -1,
        first_page: 1,
        next_page_url: nextId ? `?lastId=${nextId}&limit=${limit}` : null,
        previous_page_url: null,
      },
      metrics,
    }
  }

  // ==========================================
  // STATISTICS METHODS
  // ==========================================

  /**
   * Get region statistics
   */
  async getRegionStats(): Promise<{ results: RegionStats[]; metrics: QueryMetrics }> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    const sql = `SELECT region, COUNT(*) as count FROM ${tableName} GROUP BY region ORDER BY region ASC`
    const result = await db.rawQuery<{ rows: { region: string; count: string }[] }>(sql)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'stats_regions'
    )

    const stats = result.rows.map((row) => ({
      region: row.region,
      count: parseInt(row.count, 10),
    }))

    return { results: stats, metrics }
  }

  /**
   * Get summary statistics
   */
  async getSummaryStats(): Promise<{ results: any; metrics: QueryMetrics }> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    const sql = `
      SELECT 
        COUNT(*) as total_count,
        COUNT(DISTINCT country) as unique_countries,
        COUNT(DISTINCT city) as unique_cities,
        COUNT(DISTINCT region) as unique_regions,
        pg_size_pretty(pg_relation_size('${tableName}')) as table_size
      FROM ${tableName}
    `
    const result = await db.rawQuery<{ rows: any[] }>(sql)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      1,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'stats_summary'
    )

    return { results: result.rows[0], metrics }
  }

  // ==========================================
  // MATERIALIZED VIEW METHODS (Option 2 only)
  // ==========================================

  /**
   * Refresh materialized view (blocking)
   */
  async refreshMv(): Promise<{ result: any; metrics: QueryMetrics }> {
    const startTime = performance.now()

    const result = await db.rawQuery<{ rows: any[] }>(`SELECT * FROM refresh_institutions_mv()`)
    const duration_ms = performance.now() - startTime

    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      1,
      'mv',
      undefined,
      this.getConnectionInfo(),
      'mv_refresh'
    )

    return { result: result.rows[0], metrics }
  }

  /**
   * Refresh materialized view concurrently (non-blocking)
   */
  async refreshMvConcurrent(): Promise<{ result: any; metrics: QueryMetrics }> {
    const startTime = performance.now()

    const result = await db.rawQuery<{ rows: any[] }>(`SELECT * FROM refresh_institutions_mv_concurrent()`)
    const duration_ms = performance.now() - startTime

    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      1,
      'mv',
      undefined,
      this.getConnectionInfo(),
      'mv_refresh_concurrent'
    )

    return { result: result.rows[0], metrics }
  }

  /**
   * Get materialized view status
   */
  async getMvStatus(): Promise<{ result: MvStatus; metrics: QueryMetrics }> {
    const startTime = performance.now()

    const result = await db.rawQuery<{ rows: MvStatus[] }>(`SELECT * FROM get_mv_status()`)
    const duration_ms = performance.now() - startTime

    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      1,
      'mv',
      undefined,
      this.getConnectionInfo(),
      'mv_status'
    )

    return { result: result.rows[0], metrics }
  }

  // ==========================================
  // EXPLAIN METHODS
  // ==========================================

  /**
   * Get EXPLAIN output for a specific region query
   */
  async getExplainForRegion(region: string, term: string, queryType: string = 'ilike'): Promise<any> {
    const tableName = this.getTableName()
    const pattern = `%${term}%`

    let sql: string
    switch (queryType) {
      case 'like':
        sql = `SELECT * FROM ${tableName} WHERE region = ? AND organisation_name LIKE ? LIMIT 20`
        break
      case 'tsvector':
        sql = `SELECT * FROM ${tableName} WHERE region = ? AND search_vector @@ plainto_tsquery('english', ?) LIMIT 20`
        break
      case 'trgm':
        sql = `SELECT * FROM ${tableName} WHERE region = ? AND organisation_name % ? LIMIT 20`
        break
      case 'ilike':
      default:
        sql = `SELECT * FROM ${tableName} WHERE region = ? AND organisation_name ILIKE ? LIMIT 20`
    }

    const explain = await this.metricsService.getExplainAnalyze(sql, [region, queryType === 'tsvector' ? term : pattern])
    
    return {
      region,
      query_type: queryType,
      search_term: term,
      explain,
      sql: sql.replace('?', `'${region}'`).replace('?', `'${pattern}'`),
    }
  }

  // ==========================================
  // LOCATION DROPDOWN METHODS (for Search UI)
  // ==========================================

  /**
   * Get distinct countries for dropdown (across all regions for raw_fdw)
   */
  async getDistinctCountries(): Promise<{ results: string[]; metrics: QueryMetrics }> {
    const startTime = performance.now()
    const tables = this.getAllRegionTables()

    const unions = tables.map(t =>
      `SELECT DISTINCT country FROM ${t} WHERE country IS NOT NULL AND country != ''`
    ).join(' UNION ')

    const sql = `SELECT DISTINCT country FROM (${unions}) _all ORDER BY country ASC`

    const result = await db.rawQuery<{ rows: { country: string }[] }>(sql)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, [])
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      tables.length > 1 ? 'union' : this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'distinct_countries'
    )

    return { 
      results: result.rows.map(r => r.country), 
      metrics 
    }
  }

  /**
   * Get distinct cities for a specific country (across all regions for raw_fdw)
   */
  async getDistinctCitiesByCountry(country: string): Promise<{ results: string[]; metrics: QueryMetrics }> {
    const startTime = performance.now()
    const tables = this.getAllRegionTables()

    const unions = tables.map(t =>
      `SELECT DISTINCT city FROM ${t} WHERE country ILIKE ? AND city IS NOT NULL AND city != ''`
    ).join(' UNION ')

    const sql = `SELECT DISTINCT city FROM (${unions}) _all ORDER BY city ASC`
    const params = tables.map(() => `%${country}%`)

    const result = await db.rawQuery<{ rows: { city: string }[] }>(sql, params)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, params)
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      tables.length > 1 ? 'union' : this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'distinct_cities',
      country
    )

    return { 
      results: result.rows.map(r => r.city), 
      metrics 
    }
  }

  /**
   * Search institutions by country and optional city
   */
  async searchByLocation(
    country: string, 
    city?: string, 
    limit: number = 25
  ): Promise<SearchResult> {
    const startTime = performance.now()
    const tableName = this.getTableName()

    let sql: string
    let params: any[]

    if (city) {
      sql = `
        SELECT * FROM ${tableName}
        WHERE country ILIKE ?
          AND city ILIKE ?
        ORDER BY organisation_name ASC
        LIMIT ?
      `
      params = [`%${country}%`, `%${city}%`, limit]
    } else {
      sql = `
        SELECT * FROM ${tableName}
        WHERE country ILIKE ?
        ORDER BY organisation_name ASC
        LIMIT ?
      `
      params = [`%${country}%`, limit]
    }

    const result = await db.rawQuery<{ rows: Institution[] }>(sql, params)
    const duration_ms = performance.now() - startTime

    const explain = await this.metricsService.getExplainAnalyze(sql, params)
    const metrics = this.metricsService.buildMetrics(
      duration_ms,
      result.rows.length,
      this.getQuerySource(),
      explain,
      this.getConnectionInfo(),
      'search_by_location',
      city ? `${country}/${city}` : country
    )

    return { results: result.rows, metrics }
  }

  /**
   * Helper to determine query source based on option type
   */
  private getQuerySource(): 'local' | 'fdw' | 'master' | 'mv' {
    const optionType = this.getOptionType()
    
    switch (optionType) {
      case 'materialized_view':
        return 'mv'
      case 'eu_master_fdw':
        return 'fdw'
      case 'raw_fdw':
        return this.isMaster() ? 'master' : 'local'
      default:
        return 'local'
    }
  }
}
