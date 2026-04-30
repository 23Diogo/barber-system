import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense } from '../../middleware/license'
import { getGrowthPanel } from './reports.controller'

const router = Router()
router.use(authenticate, checkLicense)

router.get('/growth', getGrowthPanel)

export default router
