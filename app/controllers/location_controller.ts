import type { HttpContext } from '@adonisjs/core/http'
import InstitutionRepository from '#repositories/institution_repository'

// Module-level cache for countries (they rarely change; 1-hour TTL)
const CACHE_TTL_MS = 3_600_000
let countriesCache: { data: any; expiresAt: number } | null = null

export default class LocationController {
  private repo = new InstitutionRepository()

  /**
   * Get all distinct countries (cached 1 hour)
   * GET /api/locations/countries
   */
  async countries({ response }: HttpContext) {
    const now = Date.now()

    if (countriesCache && now < countriesCache.expiresAt) {
      response.header('Cache-Control', 'public, max-age=3600')
      response.header('X-Cache', 'HIT')
      return response.json(countriesCache.data)
    }

    const result = await this.repo.getDistinctCountries()
    countriesCache = { data: result, expiresAt: now + CACHE_TTL_MS }

    response.header('Cache-Control', 'public, max-age=3600')
    response.header('X-Cache', 'MISS')
    return response.json(result)
  }

  /**
   * Get cities for a specific country
   * GET /api/locations/cities/:country
   */
  async citiesByCountry({ response, params }: HttpContext) {
    const country = decodeURIComponent(params.country || '')

    if (!country) {
      return response.badRequest({ error: 'Country parameter is required' })
    }

    const result = await this.repo.getDistinctCitiesByCountry(country)
    return response.json(result)
  }

  /**
   * Search institutions by location
   * GET /api/locations/search?country=UK&city=London&limit=25
   */
  async search({ request, response }: HttpContext) {
    const country = request.input('country', '')
    const city = request.input('city', '')
    const limit = request.input('limit', 25)

    if (!country) {
      return response.badRequest({ error: 'Country parameter is required' })
    }

    const result = await this.repo.searchByLocation(country, city || undefined, limit)
    return response.json(result)
  }
}
