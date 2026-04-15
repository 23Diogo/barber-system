import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense } from '../../middleware/license'
import {
  list,
  getOne,
  getActiveByClient,
  create,
  update,
  activate,
  pause,
  reactivate,
  cancel,
  generateNextCycle,
  consume,
} from './subscriptions.controller'

const router = Router()
router.use(authenticate, checkLicense)

router.get('/', list)
router.get('/client/:clientId/active', getActiveByClient)
router.get('/:id', getOne)
router.post('/', create)
router.patch('/:id', update)

router.post('/:id/activate', activate)
router.post('/:id/pause', pause)
router.post('/:id/reactivate', reactivate)
router.post('/:id/cancel', cancel)

router.post('/:id/generate-next-cycle', generateNextCycle)
router.post('/:id/consume', consume)

export default router
