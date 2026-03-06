import db from '@adonisjs/lucid/services/db'
import type { ExplainOutput, FdwScanDetails, BufferStats, QueryMetrics } from '#types/institution'

/**
 * Service for collecting query execution metrics
 * Provides timing, cost estimation, buffer stats, and FDW-specific details
 */
export default class MetricsService {
  /**
   * Execute a query function and collect metrics
   */
  async measureQuery<T>(
    queryFn: () => Promise<T>,
    querySource: 'local' | 'fdw' | 'master' | 'mv' | 'union' = 'local',
    queryType?: string
  ): Promise<{ result: T; metrics: QueryMetrics }> {
    const startTime = performance.now()
    const result = await queryFn()
    const endTime = performance.now()

    const duration_ms = Math.round((endTime - startTime) * 100) / 100

    let rows_returned = 0
    if (Array.isArray(result)) {
      rows_returned = result.length
    } else if (result && typeof result === 'object' && 'rows' in result) {
      rows_returned = (result as any).rows?.length || 0
    } else if (result) {
      rows_returned = 1
    }

    return {
      result,
      metrics: {
        duration_ms,
        rows_returned,
        query_source: querySource,
        executed_at: new Date().toISOString(),
        query_type: queryType,
      },
    }
  }

  /**
   * Run EXPLAIN ANALYZE with BUFFERS on a SQL query
   */
  async getExplainAnalyze(sql: string, params: any[] = []): Promise<ExplainOutput> {
    try {
      const explainSql = `EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON) ${sql}`
      const result = await db.rawQuery(explainSql, params)

      const rows = (result as any).rows
      const planJson = rows[0]['QUERY PLAN'] || rows[0]
      const plan = Array.isArray(planJson) ? planJson[0] : planJson

      return this.parsePlanJson(plan)
    } catch (error) {
      console.error('EXPLAIN ANALYZE failed:', error)
      return {
        planning_time_ms: 0,
        execution_time_ms: 0,
        total_cost: 0,
        startup_cost: 0,
        plan_rows: 0,
        node_type: 'unknown',
        fdw_scans: [],
      }
    }
  }

  /**
   * Parse PostgreSQL EXPLAIN JSON output
   */
  private parsePlanJson(plan: any): ExplainOutput {
    const rootPlan = plan.Plan || plan

    const output: ExplainOutput = {
      planning_time_ms: plan['Planning Time'] || 0,
      execution_time_ms: plan['Execution Time'] || 0,
      total_cost: rootPlan['Total Cost'] || 0,
      startup_cost: rootPlan['Startup Cost'] || 0,
      plan_rows: rootPlan['Plan Rows'] || 0,
      actual_rows: rootPlan['Actual Rows'],
      node_type: rootPlan['Node Type'] || 'unknown',
      fdw_scans: this.extractFdwScans(rootPlan),
      buffers: this.extractBufferStats(rootPlan),
      scan_type: this.determineScanType(rootPlan),
      index_used: this.extractIndexName(rootPlan),
    }

    return output
  }

  /**
   * Recursively extract Foreign Scan nodes from plan tree
   */
  private extractFdwScans(node: any): FdwScanDetails[] {
    const scans: FdwScanDetails[] = []
    if (!node) return scans

    if (node['Node Type'] === 'Foreign Scan') {
      scans.push({
        node_type: 'Foreign Scan',
        relation_name: node['Relation Name'] || 'unknown',
        schema_name: node['Schema'] || node['Alias'],
        startup_cost: node['Startup Cost'] || 0,
        total_cost: node['Total Cost'] || 0,
        plan_rows: node['Plan Rows'] || 0,
        actual_rows: node['Actual Rows'],
        actual_startup_time_ms: node['Actual Startup Time'],
        actual_total_time_ms: node['Actual Total Time'],
        remote_sql: node['Remote SQL'],
      })
    }

    if (node.Plans && Array.isArray(node.Plans)) {
      for (const childPlan of node.Plans) {
        scans.push(...this.extractFdwScans(childPlan))
      }
    }

    return scans
  }

  /**
   * Extract buffer statistics from plan
   */
  private extractBufferStats(node: any): BufferStats | undefined {
    if (!node) return undefined

    const hasBuffers = node['Shared Hit Blocks'] !== undefined ||
                      node['Shared Read Blocks'] !== undefined ||
                      node['Local Hit Blocks'] !== undefined

    if (!hasBuffers) return undefined

    return {
      shared_hit: node['Shared Hit Blocks'],
      shared_read: node['Shared Read Blocks'],
      shared_written: node['Shared Written Blocks'],
      local_hit: node['Local Hit Blocks'],
      local_read: node['Local Read Blocks'],
      local_written: node['Local Written Blocks'],
      temp_read: node['Temp Read Blocks'],
      temp_written: node['Temp Written Blocks'],
    }
  }

  /**
   * Determine the scan type used
   */
  private determineScanType(node: any): 'seq' | 'index' | 'bitmap' | 'foreign' | undefined {
    if (!node) return undefined
    
    const nodeType = node['Node Type']
    if (nodeType === 'Seq Scan') return 'seq'
    if (nodeType === 'Index Scan' || nodeType === 'Index Only Scan') return 'index'
    if (nodeType === 'Bitmap Heap Scan' || nodeType === 'Bitmap Index Scan') return 'bitmap'
    if (nodeType === 'Foreign Scan') return 'foreign'

    // Check children
    if (node.Plans && Array.isArray(node.Plans)) {
      for (const child of node.Plans) {
        const childType = this.determineScanType(child)
        if (childType) return childType
      }
    }

    return undefined
  }

  /**
   * Extract index name if index scan was used
   */
  private extractIndexName(node: any): string | undefined {
    if (!node) return undefined
    
    if (node['Index Name']) return node['Index Name']

    if (node.Plans && Array.isArray(node.Plans)) {
      for (const child of node.Plans) {
        const indexName = this.extractIndexName(child)
        if (indexName) return indexName
      }
    }

    return undefined
  }

  /**
   * Build complete metrics object
   */
  buildMetrics(
    duration_ms: number,
    rows_returned: number,
    query_source: 'local' | 'fdw' | 'master' | 'mv' | 'union',
    explain?: ExplainOutput,
    connection?: { is_master: boolean; region: string; table_used: string },
    query_type?: string,
    search_term?: string
  ): QueryMetrics {
    return {
      duration_ms: Math.round(duration_ms * 100) / 100,
      rows_returned,
      query_source,
      executed_at: new Date().toISOString(),
      explain,
      connection,
      query_type,
      search_term,
      scan_type: explain?.scan_type,
      index_used: explain?.index_used,
    }
  }
}