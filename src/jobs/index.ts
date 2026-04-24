import cron from 'node-cron'
import { runSubscriptionReminder } from './subscription-reminder'
import { runBillsReminder }        from './bills-reminder'
import { runAppointmentReminder }  from './appointment-reminder'
import { runStockAlert }           from './stock-alert'

// ─── Appointment reminder: a cada 15 minutos ─────────────────────────────────
cron.schedule('*/15 * * * *', async () => {
  try { await runAppointmentReminder() }
  catch (err: any) { console.error('❌ [cron] appointment-reminder:', err.message) }
})

// ─── Jobs diários: roda a cada hora e passa a hora atual para cada job ────────
// Cada job filtra internamente as barbearias cujo daily_jobs_hour bate com a hora atual.
// Isso garante que cada barbearia receba notificações apenas no horário que configurou.
cron.schedule('0 * * * *', async () => {
  const currentHour = new Date().getHours()
  console.log(`⏰ [cron] Jobs diários — hora atual: ${currentHour}`)

  await Promise.allSettled([
    runSubscriptionReminder(currentHour).catch((err: any) =>
      console.error('❌ [cron] subscription-reminder:', err.message)
    ),
    runBillsReminder(currentHour).catch((err: any) =>
      console.error('❌ [cron] bills-reminder:', err.message)
    ),
    runStockAlert(currentHour).catch((err: any) =>
      console.error('❌ [cron] stock-alert:', err.message)
    ),
  ])
})

console.log('✅ Jobs agendados: appointment-reminder (15min) + diários (por hora configurada por barbearia)')
