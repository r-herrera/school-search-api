import type { HttpContext } from '@adonisjs/core/http'
import InstitutionRepository from '#repositories/institution_repository'

export default class FilterController {
  private repo = new InstitutionRepository()

  /**
   * Filter by country
   * GET /api/filter/country/:code?limit=50
   */
  async byCountry({ request, response, params }: HttpContext) {
    const countryCode = params.code || ''
    const limit = request.input('limit', 50)

    if (!countryCode) {
      return response.badRequest({ error: 'Missing country code' })
    }

    const result = await this.repo.filterByCountry(countryCode, limit)
    return response.json(result)
  }

  /**
   * Filter by city
   * GET /api/filter/city/:name?limit=50
   */
  async byCity({ request, response, params }: HttpContext) {
    const city = params.name || ''
    const limit = request.input('limit', 50)

    if (!city) {
      return response.badRequest({ error: 'Missing city name' })
    }

    const result = await this.repo.filterByCity(city, limit)
    return response.json(result)
  }

  /**
   * Filter with multiple criteria
   * GET /api/filter?country=US&city=New York&search=university&limit=50
   */
  async multiFilter({ request, response }: HttpContext) {
    const country = request.input('country', '')
    const city = request.input('city', '')
    const search = request.input('search', '')
    const limit = request.input('limit', 50)

    // At least one filter must be provided
    if (!country && !city && !search) {
      return response.badRequest({ 
        error: 'At least one filter (country, city, or search) must be provided' 
      })
    }

    // For now, if we have multiple filters, use the search method with the search term
    // and let's use country filter as main if no search provided
    if (search) {
      const result = await this.repo.searchWithIlike(search, limit)
      // Filter results further by country/city if provided
      let filtered = result.results
      if (country) {
        filtered = filtered.filter(r => r.country?.toLowerCase().includes(country.toLowerCase()))
      }
      if (city) {
        filtered = filtered.filter(r => r.city?.toLowerCase().includes(city.toLowerCase()))
      }
      return response.json({
        results: filtered,
        metrics: {
          ...result.metrics,
          result_count: filtered.length,
          filters_applied: { country, city, search }
        }
      })
    }

    // Just country or city filter
    if (country) {
      const result = await this.repo.filterByCountry(country, limit)
      if (city) {
        const filtered = result.results.filter(r => 
          r.city?.toLowerCase().includes(city.toLowerCase())
        )
        return response.json({
          results: filtered,
          metrics: {
            ...result.metrics,
            result_count: filtered.length,
            filters_applied: { country, city }
          }
        })
      }
      return response.json(result)
    }

    const result = await this.repo.filterByCity(city, limit)
    return response.json(result)
  }
}
