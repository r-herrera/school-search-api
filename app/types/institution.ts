/**
 * Institution entity type
 */
export interface Institution {
  id: number
  organisation_name: string
  street_1: string | null
  street_2: string | null
  city: string | null
  country: string | null
  website: string | null
  region: string | null
  created_at: string
  updated_at: string
  search_vector?: string
  // Only present in JOIN search results
  centre_number?: string | null
  parent_centre_number?: string | null
}

/**
 * Filter options for institution queries
 */
export interface InstitutionFilters {
  page?: number
  limit?: number
  region?: string
  country?: string
  city?: string
  search?: string
  lastId?: number // For keyset pagination
}

/**
 * FDW scan details from EXPLAIN output
 */
export interface FdwScanDetails {
  node_type: string
  relation_name: string
  schema_name?: string
  startup_cost: number
  total_cost: number
  plan_rows: number
  actual_rows?: number
  actual_startup_time_ms?: number
  actual_total_time_ms?: number
  remote_sql?: string
}

/**
 * Buffer statistics from EXPLAIN output
 */
export interface BufferStats {
  shared_hit?: number
  shared_read?: number
  shared_written?: number
  local_hit?: number
  local_read?: number
  local_written?: number
  temp_read?: number
  temp_written?: number
}

/**
 * EXPLAIN ANALYZE output structure
 */
export interface ExplainOutput {
  planning_time_ms: number
  execution_time_ms: number
  total_cost: number
  startup_cost: number
  plan_rows: number
  actual_rows?: number
  node_type: string
  fdw_scans: FdwScanDetails[]
  buffers?: BufferStats
  index_used?: string
  scan_type?: 'seq' | 'index' | 'bitmap' | 'foreign'
}

/**
 * Query metrics for benchmarking
 */
export interface QueryMetrics {
  duration_ms: number
  rows_returned: number
  query_source: 'local' | 'fdw' | 'master' | 'mv' | 'union'
  executed_at: string
  explain?: ExplainOutput
  connection?: {
    is_master: boolean
    region: string
    table_used: string
  }
  query_type?: string
  search_term?: string
  scan_type?: 'seq' | 'index' | 'bitmap' | 'foreign'
  index_used?: string
}

/**
 * Cross-region relationship
 */
export interface CrossRegionRelationship {
  child_id: number
  child_name: string
  child_centre: string
  child_country: string
  child_region: string
  parent_id: number
  parent_name: string
  parent_centre: string
  parent_country: string
  parent_region: string
  relationship_description: string
}

/**
 * MV status information
 */
export interface MvStatus {
  mv_name: string
  row_count: number
  size_bytes: number
  size_pretty: string
  last_refresh: string | null
  last_refresh_type: string | null
  last_refresh_duration_ms: number | null
  avg_refresh_duration_ms: number | null
}

/**
 * Region statistics
 */
export interface RegionStats {
  region: string
  count: number
}

/**
 * Search result with metrics
 */
export interface SearchResult {
  results: Institution[]
  total?: number
  metrics: QueryMetrics
}

/**
 * Paginated result
 */
export interface PaginatedResult {
  data: Institution[]
  meta: {
    total: number
    per_page: number
    current_page: number
    last_page: number
    first_page: number
    next_page_url: string | null
    previous_page_url: string | null
  }
  metrics: QueryMetrics
}
