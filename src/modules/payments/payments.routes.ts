import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense } from '../../middleware/license'
import {
  webhook,
  listInvoices,
  createManualInvoice,
  markInvoicePaid,
  markInvoiceFailed,
  cancelInvoice,
} from './payments.controller'

const router = Router()

router.post('/webhook/:provider', webhook)
router.post('/webhook', webhook)

router.use(authenticate, checkLicense)
router.get('/invoices', listInvoices)
router.post('/invoices/manual', createManualInvoice)
router.post('/invoices/:id/mark-paid', markInvoicePaid)
router.post('/invoices/:id/mark-failed', markInvoiceFailed)
router.post('/invoices/:id/cancel', cancelInvoice)

export default router
