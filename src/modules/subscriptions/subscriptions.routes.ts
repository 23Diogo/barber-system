import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense } from '../../middleware/license'
import { list, getOne, create, update, generateNextCycle, consume } from './subscriptions.controller'

const router = Router()
router.use(authenticate, checkLicense)

router.get('/', list)
router.get('/:id', getOne)
router.post('/', create)
router.patch('/:id', update)
router.post('/:id/generate-next-cycle', generateNextCycle)
router.post('/:id/consume', consume)

export default router
