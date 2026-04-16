import { Router } from 'express'
import {
  registerClient,
  loginClient,
  meClient,
  forgotPasswordClient,
  resetPasswordClient,
} from './client-auth.controller'
import { authenticateClient } from '../../middleware/client-auth'

const router = Router()

router.post('/register', registerClient)
router.post('/login', loginClient)
router.get('/me', authenticateClient, meClient)
router.post('/forgot-password', forgotPasswordClient)
router.post('/reset-password', resetPasswordClient)

export default router
