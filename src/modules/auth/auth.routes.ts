import { Router } from 'express'
import {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
  generatePaymentLink,
  metaConnect,
  metaCallback,
} from './auth.controller'
import { authenticate } from '../../middleware/auth'

const router = Router()

router.post('/register',        register)
router.post('/login',           login)
router.get('/me',               authenticate, me)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password',  resetPassword)

// Gera link de pagamento da licença da plataforma (usada na tela de suspensão)
router.post('/payment-link',    authenticate, generatePaymentLink)

// ─── Meta OAuth ───────────────────────────────────────────────────────────────
router.post('/meta/connect',    authenticate, metaConnect)  // retorna { url }
router.get('/meta/callback',    metaCallback)               // público — Meta redireciona aqui

export default router
