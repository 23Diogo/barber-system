import { Router } from 'express'
import { register, login, me, forgotPassword, resetPassword, generatePaymentLink } from './auth.controller'
import { authenticate } from '../../middleware/auth'

const router = Router()

router.post('/register',         register)
router.post('/login',            login)
router.get('/me',                authenticate, me)
router.post('/forgot-password',  forgotPassword)
router.post('/reset-password',   resetPassword)

// Gera link de pagamento da licença da plataforma (usada na tela de suspensão)
router.post('/payment-link',     authenticate, generatePaymentLink)

export default router
