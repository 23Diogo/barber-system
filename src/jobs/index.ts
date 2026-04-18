import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'
import { runSubscriptionReminder }  from './subscription-reminder'
import { runBillsReminder }         from './bills-reminder'
import { runAppointmentReminder }   from './appointment-reminder'
import { runStockAlert }            from './stock-alert'

// ─── Appointment reminder: a cada 15 minutos ─────────────────────────────────
cron.schedule('*/15 * * * *', async () => {
  try { await runAppointmentReminder() }
  catch (err: any) { console.error('❌ [cron] appointment-reminder:', err.message) }
})

// ─── Jobs diários: horário configurável por barbearia ─────────────────────────
// Roda a cada hora e verifica quais barbearias devem disparar agora
cron.schedule('0 * * * *', async () => {
  const currentHour = new Date().getHours()

  try {
    // Busca barbearias cujo daily_jobs_hour bate com a hora atual
    const { data: shops } = await supabaseAdmin
      .from('barbershops')
      .select('id, notification_settings')
      .eq('is_active', true)

    const shouldRun = (shops ?? []).some((shop) => {
      const hour = shop.notification_settings?.daily_jobs_hour ?? 18
      return Number(hour) === currentHour
    })

    if (!shouldRun) return

    console.log(`⏰ [cron] Disparando jobs diários (hora ${currentHour})`)

    await Promise.allSettled([
      runSubscriptionReminder(),
      runBillsReminder(),
      runStockAlert(),
    ])
  } catch (err: any) {
    console.error('❌ [cron] jobs diários:', err.message)
  }
})

console.log('✅ Jobs agendados: appointment-reminder (15min) + diários (por hora configurada)')
