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

// ─── Jobs diários: roda a cada hora exata ────────────────────────────────────
// Cada job filtra internamente quais barbearias devem rodar nesta hora
// usando o campo de hora individual de cada notificação nas settings.

cron.schedule('0 * * * *', async () => {
  const currentHour = new Date().getHours()
  console.log(`⏰ [cron] Jobs diários — hora atual: ${currentHour}h`)

  await Promise.allSettled([
    runBillsReminder(currentHour).catch((err: any) =>
      console.error('❌ [cron] bills-reminder:', err.message)
    ),
    runSubscriptionReminder(currentHour).catch((err: any) =>
      console.error('❌ [cron] subscription-reminder:', err.message)
    ),
    runStockAlert(currentHour).catch((err: any) =>
      console.error('❌ [cron] stock-alert:', err.message)
    ),
  ])
})

console.log('✅ Jobs agendados: appointment-reminder (15min) + diários (hora individual por barbearia)')
