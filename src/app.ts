import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

// ─── Rotas ───────────────────────────────────────────────────────────────────
import authRoutes          from './modules/auth/auth.routes'
import clientAuthRoutes    from './modules/client-auth/client-auth.routes'
import clientPortalRoutes  from './modules/client-portal/client-portal.routes'
import barbershopRoutes    from './modules/barbershops/barbershops.routes'
import appointmentRoutes   from './modules/appointments/appointments.routes'
import clientRoutes        from './modules/clients/clients.routes'
import serviceRoutes       from './modules/services/services.routes'
import barberRoutes        from './modules/barbers/barbers.routes'
import financialRoutes     from './modules/financial/financial.routes'
import stockRoutes         from './modules/stock/stock.routes'
import loyaltyRoutes       from './modules/loyalty/loyalty.routes'
import whatsappRoutes      from './modules/whatsapp/whatsapp.routes'
import marketingRoutes     from './modules/marketing/marketing.routes'
import dashboardRoutes     from './modules/dashboard/dashboard.routes'
import plansRoutes         from './modules/plans/plans.routes'
import subscriptionsRoutes from './modules/subscriptions/subscriptions.routes'
import paymentsRoutes      from './modules/payments/payments.routes'
import mercadoPagoRoutes   from './modules/mercadopago/mercadopago.routes'
import reviewsRoutes       from './modules/reviews/reviews.routes'
import invitesRouter       from './modules/barbershops/invites.routes'
import barberAuthRoutes    from './modules/barbers/barber-auth.routes'
import testNotifRoutes     from './modules/barbershops/test-notifications.routes'
import reportsRouter       from './modules/reports/reports.routes'

// ─── Middleware de licença da plataforma ──────────────────────────────────────
import { checkPlatformLicense } from './middleware/platformLicense'

// ─── Jobs existentes ──────────────────────────────────────────────────────────
import { startLicenseCheckJob } from './jobs/checkLicenses'
import { startReminderJob }     from './jobs/sendReminders'
import { startReactivationJob } from './jobs/reactivation'

// ─── Jobs de notificação WhatsApp (node-cron, auto-inicia ao importar) ────────
import './jobs/index'

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express()
const PORT = process.env.PORT || 3333

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(helmet())

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://bbarberflow.com.br',
  'https://www.bbarberflow.com.br',
  'https://app.bbarberflow.com.br',
  'https://barber-system-front.diogo-camarg.workers.dev',
].filter(Boolean) as string[]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS bloqueado para origem: ${origin}`))
    }
  },
  credentials: true,
}))

app.use(morgan('dev'))

// Webhook do WhatsApp precisa do body raw ANTES do express.json()
app.use('/api/whatsapp/webhook', express.raw({ type: '*/*' }))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) =>
  res.json({ status: 'ok', app: 'BarberFlow API', version: '1.0.0' })
)

// ─── Rotas públicas (sem verificação de licença da plataforma) ────────────────
app.use('/api/auth',          authRoutes)
app.use('/api/client-auth',   clientAuthRoutes)
app.use('/api/client-portal', clientPortalRoutes)
app.use('/api/whatsapp',      whatsappRoutes)
app.use('/api/mercadopago',   mercadoPagoRoutes)
app.use('/api/barber-auth',   barberAuthRoutes)

// ─── Rotas protegidas (exigem licença ativa da plataforma) ────────────────────
app.use('/api/barbershops',   checkPlatformLicense, barbershopRoutes)
app.use('/api/appointments',  checkPlatformLicense, appointmentRoutes)
app.use('/api/clients',       checkPlatformLicense, clientRoutes)
app.use('/api/services',      checkPlatformLicense, serviceRoutes)
app.use('/api/barbers',       checkPlatformLicense, barberRoutes)
app.use('/api/financial',     checkPlatformLicense, financialRoutes)
app.use('/api/stock',         checkPlatformLicense, stockRoutes)
app.use('/api/loyalty',       checkPlatformLicense, loyaltyRoutes)
app.use('/api/marketing',     checkPlatformLicense, marketingRoutes)
app.use('/api/dashboard',     checkPlatformLicense, dashboardRoutes)
app.use('/api/plans',         checkPlatformLicense, plansRoutes)
app.use('/api/subscriptions', checkPlatformLicense, subscriptionsRoutes)
app.use('/api/payments',      checkPlatformLicense, paymentsRoutes)
app.use('/api/reviews',       checkPlatformLicense, reviewsRoutes)
app.use('/api/barbershops',   checkPlatformLicense, invitesRouter)
app.use('/api/reports',       checkPlatformLicense, reportsRouter)

app.use('/api/test-notifications', checkPlatformLicense, testNotifRoutes)

// ─── Error handler global ─────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌', err.message)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n💈 BarberFlow API    → http://localhost:${PORT}`)
  console.log(`❤️  Health           → http://localhost:${PORT}/health`)
  console.log(`👤 Client Auth       → http://localhost:${PORT}/api/client-auth/login`)
  console.log(`📲 Client Portal     → http://localhost:${PORT}/api/client-portal/context`)
  console.log(`💳 Mercado Pago      → http://localhost:${PORT}/api/mercadopago/create-preference`)
  console.log(`📲 WhatsApp Webhook  → http://localhost:${PORT}/api/whatsapp/webhook`)
  console.log(`🔔 Jobs de notif.    → appointment (15min) + diários (por hora configurada)\n`)

  // Jobs legados
  startLicenseCheckJob()
  startReminderJob()
  startReactivationJob()
})

export default app
