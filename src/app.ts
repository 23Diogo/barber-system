import 'dotenv/config'
import express from 'express'
import cors    from 'cors'
import helmet  from 'helmet'
import morgan  from 'morgan'

import authRoutes        from './modules/auth/auth.routes'
import barbershopRoutes  from './modules/barbershops/barbershops.routes'
import appointmentRoutes from './modules/appointments/appointments.routes'
import clientRoutes      from './modules/clients/clients.routes'
import serviceRoutes     from './modules/services/services.routes'
import barberRoutes      from './modules/barbers/barbers.routes'
import financialRoutes   from './modules/financial/financial.routes'
import stockRoutes       from './modules/stock/stock.routes'
import loyaltyRoutes     from './modules/loyalty/loyalty.routes'
import whatsappRoutes    from './modules/whatsapp/whatsapp.routes'
import marketingRoutes   from './modules/marketing/marketing.routes'
import dashboardRoutes   from './modules/dashboard/dashboard.routes'

import { startLicenseCheckJob } from './jobs/checkLicenses'
import { startReminderJob }     from './jobs/sendReminders'
import { startReactivationJob } from './jobs/reactivation'

const app  = express()
const PORT = process.env.PORT || 3333

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }))
app.use(morgan('dev'))

// WhatsApp webhook precisa do body raw
app.use('/api/whatsapp/webhook', express.raw({ type: '*/*' }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_, res) =>
  res.json({ status: 'ok', app: 'BarberFlow API', version: '1.0.0' })
)

app.use('/api/auth',         authRoutes)
app.use('/api/barbershops',  barbershopRoutes)
app.use('/api/appointments', appointmentRoutes)
app.use('/api/clients',      clientRoutes)
app.use('/api/services',     serviceRoutes)
app.use('/api/barbers',      barberRoutes)
app.use('/api/financial',    financialRoutes)
app.use('/api/stock',        stockRoutes)
app.use('/api/loyalty',      loyaltyRoutes)
app.use('/api/whatsapp',     whatsappRoutes)
app.use('/api/marketing',    marketingRoutes)
app.use('/api/dashboard',    dashboardRoutes)
app.use('/api/plans', plansRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/payments', paymentsRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌', err.message)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`\n💈 BarberFlow API → http://localhost:${PORT}`)
  console.log(`❤️  Health       → http://localhost:${PORT}/health\n`)
  startLicenseCheckJob()
  startReminderJob()
  startReactivationJob()
})

export default app
