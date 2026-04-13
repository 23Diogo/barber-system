import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { list, slots, create, update, cancel, complete, rate } from './appointments.controller'

const router = Router()
router.use(authenticate, checkLicense)
router.get('/',                 list)
router.get('/available-slots',  slots)
router.post('/',                create)
router.patch('/:id',            update)
router.patch('/:id/cancel',     cancel)
router.patch('/:id/complete',   complete)
router.post('/:id/rate',        rate)
export default router
