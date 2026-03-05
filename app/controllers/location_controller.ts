import type { HttpContext } from '@adonisjs/core/http'
import InstitutionRepository from '#repositories/institution_repository'

export default class LocationController {
  private repo = new InstitutionRepository()

  /**
   * Get all distinct countries
   * GET /api/locations/countries
   */
  async countries({ response }: HttpContext) {
    const result = await this.repo.getDistinctCountries()
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
