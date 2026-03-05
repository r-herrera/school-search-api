import router from '@adonisjs/core/services/router'

router.use([
  () => import('@adonisjs/cors/cors_middleware'),
])
