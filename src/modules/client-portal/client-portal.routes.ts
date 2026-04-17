import { Router } from 'express'
import { authenticateClient } from '../../middleware/client-auth'
import {
  getPortalContext,
  listPortalServices,
  listPortalBarbers,
  listPortalAvailableSlots,
  createPortalAppointment,
  listPortalAppointments,
  cancelPortalAppointment,
} from './client-portal.controller'

const router = Router()

router.use(authenticateClient)

router.get('/context', getPortalContext)
router.get('/services', listPortalServices)
router.get('/barbers', listPortalBarbers)
router.get('/available-slots', listPortalAvailableSlots)

router.get('/appointments', listPortalAppointments)
router.post('/appointments', createPortalAppointment)
router.patch('/appointments/:id/cancel', cancelPortalAppointment)

export default router
