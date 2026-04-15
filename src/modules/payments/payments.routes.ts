import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense } from '../../middleware/license'
import { webhook, listInvoices, createManualInvoice } from './payments.controller'

const router = Router()

// webhook público
router.post('/webhook', webhook)

// rotas protegidas
router.use(authenticate, checkLicense)
router.get('/invoices', listInvoices)
router.post('/invoices/manual', createManualInvoice)

export default router
