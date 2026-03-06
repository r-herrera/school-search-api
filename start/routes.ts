import router from '@adonisjs/core/services/router'

// Lazy load controllers
const SearchController = () => import('#controllers/search_controller')
const ExplainController = () => import('#controllers/explain_controller')
const FilterController = () => import('#controllers/filter_controller')
const PaginationController = () => import('#controllers/pagination_controller')
const MvController = () => import('#controllers/mv_controller')
const StatsController = () => import('#controllers/stats_controller')
const LocationController = () => import('#controllers/location_controller')

// Root endpoint - API info
router.get('/', async ({}) => {
  const optionType = process.env.OPTION_TYPE || 'unknown'
  const region = process.env.DB_REGION || 'unknown'
  
  return {
    name: 'Institutions API Benchmark',
    version: '1.0.0',
    description: `Cross-region PostgreSQL benchmark API - ${optionType}`,
    option: optionType,
    region: region,
    endpoints: {
      search: {
        paginated: 'GET /api/search/paginated?q=term&method=websearch|trgm&page=1&limit=25',
        like: 'GET /api/search/like?q=term&limit=50',
        ilike: 'GET /api/search/ilike?q=term&limit=50',
        tsvector: 'GET /api/search/tsvector?q=term&limit=50',
        websearch: 'GET /api/search/websearch?q=term&limit=50',
        trgm: 'GET /api/search/trgm?q=term&limit=50&threshold=0.3',
        union: 'GET /api/search/union?q=term&limit=50',
        join: 'GET /api/search/join?q=term&limit=50',
        compare: 'GET /api/search/compare?q=term&limit=20',
      },
      filter: {
        country: 'GET /api/filter/country/:code?limit=50',
        city: 'GET /api/filter/city/:name?limit=50',
        multi: 'GET /api/filter?country=US&city=New York&search=term&limit=50',
      },
      paginate: {
        offset: 'GET /api/paginate/offset?page=1&limit=20',
        keyset: 'GET /api/paginate/keyset?lastId=0&limit=20',
        compare: 'GET /api/paginate/compare?page=10&limit=20',
      },
      explain: {
        region: 'GET /api/explain/:region?q=term&type=ilike',
        compare: 'GET /api/explain/compare?q=term&region=us',
        raw: 'POST /api/explain/raw (body: { sql, params })',
      },
      mv: {
        refresh: 'POST /api/mv/refresh',
        refreshConcurrent: 'POST /api/mv/refresh-concurrent',
        status: 'GET /api/mv/status',
        compareRefresh: 'POST /api/mv/compare-refresh',
      },
      stats: {
        all: 'GET /api/stats',
        regions: 'GET /api/stats/regions',
        summary: 'GET /api/stats/summary',
        config: 'GET /api/stats/config',
        health: 'GET /api/health',
      },
      locations: {
        countries: 'GET /api/locations/countries',
        cities: 'GET /api/locations/cities/:country',
        search: 'GET /api/locations/search?country=UK&city=London&limit=25',
      },
    },
  }
})

// Health check
router.get('/api/health', [StatsController, 'health'])

// API routes group
router.group(() => {
  // ==========================================
  // FRONTEND ROUTES (used by search-ui-static)
  // ==========================================

  // Paginated search with ranking (primary search endpoint)
  // Browse by location without a search term
  router.group(() => {
    router.get('/paginated', [SearchController, 'searchPaginated'])
    router.get('/browse', [SearchController, 'browsePaginated'])
  }).prefix('search')

  // Location dropdowns (countries, cities)
  router.group(() => {
    router.get('/countries', [LocationController, 'countries'])
    router.get('/cities/:country', [LocationController, 'citiesByCountry'])
    router.get('/search', [LocationController, 'search'])
  }).prefix('locations')

  // ==========================================
  // BENCHMARK & DEVELOPMENT ROUTES
  // ==========================================

  // Individual search method routes (for benchmarking / comparison)
  router.group(() => {
    router.get('/like', [SearchController, 'like'])
    router.get('/ilike', [SearchController, 'ilike'])
    router.get('/tsvector', [SearchController, 'tsvectorPlainto'])
    router.get('/websearch', [SearchController, 'tsvectorWebsearch'])
    router.get('/trgm', [SearchController, 'trgm'])
    router.get('/union', [SearchController, 'union'])
    router.get('/join', [SearchController, 'join'])
    router.get('/compare', [SearchController, 'compare'])
  }).prefix('search')

  // Filter routes (benchmarking)
  router.group(() => {
    router.get('/country/:code', [FilterController, 'byCountry'])
    router.get('/city/:name', [FilterController, 'byCity'])
    router.get('/', [FilterController, 'multiFilter'])
  }).prefix('filter')

  // Pagination routes (benchmarking)
  router.group(() => {
    router.get('/offset', [PaginationController, 'offset'])
    router.get('/keyset', [PaginationController, 'keyset'])
    router.get('/compare', [PaginationController, 'compare'])
  }).prefix('paginate')

  // Explain routes (development / debugging)
  router.group(() => {
    router.get('/compare', [ExplainController, 'compareAll'])
    router.post('/raw', [ExplainController, 'analyzeRaw'])
    router.get('/:region', [ExplainController, 'analyzeRegion'])
  }).prefix('explain')

  // Materialized View routes (Option 2 only)
  router.group(() => {
    router.post('/refresh', [MvController, 'refresh'])
    router.post('/refresh-concurrent', [MvController, 'refreshConcurrent'])
    router.get('/status', [MvController, 'status'])
    router.post('/compare-refresh', [MvController, 'compareRefresh'])
  }).prefix('mv')

  // Stats routes (monitoring)
  router.group(() => {
    router.get('/', [StatsController, 'all'])
    router.get('/regions', [StatsController, 'regions'])
    router.get('/summary', [StatsController, 'summary'])
    router.get('/config', [StatsController, 'config'])
  }).prefix('stats')
}).prefix('api')
