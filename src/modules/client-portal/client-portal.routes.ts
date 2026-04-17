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
  listPortalPlans,
  getPortalSubscription,
  createPortalSubscriptionCheckout,
  cancelPortalPendingSubscription,
  getPortalProfile,
  updatePortalProfile,
  changePortalPassword,
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

router.get('/plans', listPortalPlans)
router.get('/subscription', getPortalSubscription)
router.post('/subscriptions/checkout', createPortalSubscriptionCheckout)
router.patch('/subscription/cancel', cancelPortalPendingSubscription)

router.get('/profile', getPortalProfile)
router.patch('/profile', updatePortalProfile)
router.post('/change-password', changePortalPassword)

export default router
