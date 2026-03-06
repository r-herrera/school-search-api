import type { HttpContext } from '@adonisjs/core/http'
import InstitutionRepository from '#repositories/institution_repository'

export default class SearchController {
  private repo = new InstitutionRepository()

  /**
   * Search using LIKE (case-sensitive)
   * GET /api/search/like?q=university&limit=50
   */
  async like({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const limit = request.input('limit', 50)

    if (!term) {
      return response.badRequest({ error: 'Missing search term "q"' })
    }

    const result = await this.repo.searchWithLike(term, limit)
    return response.json(result)
  }

  /**
   * Search using ILIKE (case-insensitive)
   * GET /api/search/ilike?q=university&limit=50
   */
  async ilike({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const limit = request.input('limit', 50)

    if (!term) {
      return response.badRequest({ error: 'Missing search term "q"' })
    }

    const result = await this.repo.searchWithIlike(term, limit)
    return response.json(result)
  }

  /**
   * Search using tsvector with plainto_tsquery
   * GET /api/search/tsvector?q=university college&limit=50
   */
  async tsvectorPlainto({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const limit = request.input('limit', 50)

    if (!term) {
      return response.badRequest({ error: 'Missing search term "q"' })
    }

    const result = await this.repo.searchWithTsvectorPlainto(term, limit)
    return response.json(result)
  }

  /**
   * Search using tsvector with websearch_to_tsquery (natural language)
   * GET /api/search/websearch?q="state university" OR college&limit=50
   */
  async tsvectorWebsearch({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const limit = request.input('limit', 50)

    if (!term) {
      return response.badRequest({ error: 'Missing search term "q"' })
    }

    const result = await this.repo.searchWithTsvectorWebsearch(term, limit)
    return response.json(result)
  }

  /**
   * Search using pg_trgm fuzzy matching
   * GET /api/search/trgm?q=univrsity&limit=50&threshold=0.3
   */
  async trgm({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const limit = request.input('limit', 50)
    const threshold = request.input('threshold', 0.3)

    if (!term) {
      return response.badRequest({ error: 'Missing search term "q"' })
    }

    const result = await this.repo.searchWithTrgm(term, limit, threshold)
    return response.json(result)
  }

  /**
   * Search using UNION ALL across all regions
   * GET /api/search/union?q=university&limit=50
   */
  async union({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const limit = request.input('limit', 50)

    if (!term) {
      return response.badRequest({ error: 'Missing search term "q"' })
    }

    const result = await this.repo.searchUnionAll(term, limit)
    return response.json(result)
  }

  /**
   * Search using JOIN for cross-region
   * GET /api/search/join?q=university&limit=50
   */
  async join({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const limit = request.input('limit', 50)

    if (!term) {
      return response.badRequest({ error: 'Missing search term "q"' })
    }

    const result = await this.repo.searchWithJoin(term, limit)
    return response.json(result)
  }

  /**
   * Paginated search with ranking method selection
   * GET /api/search/paginated?q=school&method=websearch&page=1&limit=20&country=UK&city=London
   */
  async searchPaginated({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const method = request.input('method', 'websearch') as 'websearch' | 'trgm'
    const page = Math.max(1, parseInt(request.input('page', '1'), 10))
    const limit = Math.min(100, Math.max(1, parseInt(request.input('limit', '25'), 10)))
    const country = request.input('country', '') || undefined
    const city = request.input('city', '') || undefined

    if (!term || term.length < 2) {
      return response.badRequest({ error: 'Search term "q" is required (min 2 characters)' })
    }

    if (!['websearch', 'trgm'].includes(method)) {
      return response.badRequest({ error: 'Method must be "websearch" or "trgm"' })
    }

    const result = await this.repo.searchPaginated(term, method, page, limit, { country, city })
    return response.json(result)
  }

  /**
   * Compare all search methods
   * GET /api/search/compare?q=university&limit=20
   */
  async compare({ request, response }: HttpContext) {
    const term = request.input('q', '')
    const limit = request.input('limit', 20)

    if (!term) {
      return response.badRequest({ error: 'Missing search term "q"' })
    }

    // Run all searches
    const [like, ilike, tsvectorPlainto, tsvectorWebsearch, trgm] = await Promise.all([
      this.repo.searchWithLike(term, limit),
      this.repo.searchWithIlike(term, limit),
      this.repo.searchWithTsvectorPlainto(term, limit),
      this.repo.searchWithTsvectorWebsearch(term, limit),
      this.repo.searchWithTrgm(term, limit),
    ])

    // Build comparison summary
    const comparison = {
      search_term: term,
      limit,
      methods: {
        like: {
          result_count: like.results.length,
          duration_ms: like.metrics.duration_ms,
          scan_type: like.metrics.scan_type,
          index_used: like.metrics.index_used,
        },
        ilike: {
          result_count: ilike.results.length,
          duration_ms: ilike.metrics.duration_ms,
          scan_type: ilike.metrics.scan_type,
          index_used: ilike.metrics.index_used,
        },
        tsvector_plainto: {
          result_count: tsvectorPlainto.results.length,
          duration_ms: tsvectorPlainto.metrics.duration_ms,
          scan_type: tsvectorPlainto.metrics.scan_type,
          index_used: tsvectorPlainto.metrics.index_used,
        },
        tsvector_websearch: {
          result_count: tsvectorWebsearch.results.length,
          duration_ms: tsvectorWebsearch.metrics.duration_ms,
          scan_type: tsvectorWebsearch.metrics.scan_type,
          index_used: tsvectorWebsearch.metrics.index_used,
        },
        trgm: {
          result_count: trgm.results.length,
          duration_ms: trgm.metrics.duration_ms,
          scan_type: trgm.metrics.scan_type,
          index_used: trgm.metrics.index_used,
        },
      },
      fastest_method: this.getFastestMethod({ like, ilike, tsvectorPlainto, tsvectorWebsearch, trgm }),
      full_results: {
        like,
        ilike,
        tsvector_plainto: tsvectorPlainto,
        tsvector_websearch: tsvectorWebsearch,
        trgm,
      },
    }

    return response.json(comparison)
  }

  /**
   * Browse institutions by country (and optionally city) — no search term required.
   * Uses exact country match for index-friendly cross-region queries.
   * GET /api/search/browse?country=United+Kingdom&city=London&page=1&limit=25
   */
  async browsePaginated({ request, response }: HttpContext) {
    const country = (request.input('country', '') as string).trim()
    const city = (request.input('city', '') as string).trim() || undefined
    const page = Math.max(1, parseInt(request.input('page', '1'), 10))
    const limit = Math.min(100, Math.max(1, parseInt(request.input('limit', '25'), 10)))

    if (!country) {
      return response.badRequest({ error: 'Query parameter "country" is required' })
    }

    const result = await this.repo.browsePaginated(page, limit, { country, city })
    return response.json(result)
  }

  private getFastestMethod(results: Record<string, { metrics: { duration_ms: number } }>) {
    let fastest = ''
    let minDuration = Infinity

    for (const [method, result] of Object.entries(results)) {
      if (result.metrics.duration_ms < minDuration) {
        minDuration = result.metrics.duration_ms
        fastest = method
      }
    }

    return { method: fastest, duration_ms: minDuration }
  }
}
