import type { HttpContext } from '@adonisjs/core/http'
import InstitutionRepository from '#repositories/institution_repository'

export default class PaginationController {
  private repo = new InstitutionRepository()

  /**
   * Paginate using OFFSET (traditional)
   * GET /api/paginate/offset?page=1&limit=20&search=university
   */
  async offset({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)
    
    const filters = {
      region: request.input('region'),
      country: request.input('country'),
      search: request.input('search'),
    }

    const result = await this.repo.paginateWithOffset(page, limit, filters)
    return response.json(result)
  }

  /**
   * Paginate using keyset (cursor-based)
   * GET /api/paginate/keyset?lastId=100&limit=20&search=university
   */
  async keyset({ request, response }: HttpContext) {
    const lastId = request.input('lastId', 0)
    const limit = request.input('limit', 20)
    
    const filters = {
      region: request.input('region'),
      country: request.input('country'),
      search: request.input('search'),
    }

    const result = await this.repo.paginateWithKeyset(lastId, limit, filters)
    return response.json(result)
  }

  /**
   * Compare both pagination methods
   * GET /api/paginate/compare?page=10&limit=20
   */
  async compare({ request, response }: HttpContext) {
    const page = request.input('page', 10)
    const limit = request.input('limit', 20)
    
    const filters = {
      region: request.input('region'),
      country: request.input('country'),
      search: request.input('search'),
    }

    // For keyset comparison, simulate the same "page" by calculating lastId
    // This is approximate - in real usage you'd track the actual last ID
    const estimatedLastId = (page - 1) * limit

    const [offsetResult, keysetResult] = await Promise.all([
      this.repo.paginateWithOffset(page, limit, filters),
      this.repo.paginateWithKeyset(estimatedLastId, limit, filters),
    ])

    return response.json({
      comparison: {
        page_requested: page,
        limit,
        filters,
        offset: {
          duration_ms: offsetResult.metrics.duration_ms,
          result_count: offsetResult.data.length,
          total_records: offsetResult.meta.total,
          scan_type: offsetResult.metrics.scan_type,
        },
        keyset: {
          duration_ms: keysetResult.metrics.duration_ms,
          result_count: keysetResult.data.length,
          estimated_last_id: estimatedLastId,
          scan_type: keysetResult.metrics.scan_type,
        },
        performance_difference_ms: offsetResult.metrics.duration_ms - keysetResult.metrics.duration_ms,
        faster_method: offsetResult.metrics.duration_ms < keysetResult.metrics.duration_ms ? 'offset' : 'keyset',
      },
      full_results: {
        offset: offsetResult,
        keyset: keysetResult,
      },
    })
  }
}
