import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'
import { whatsappService } from '../modules/whatsapp/whatsapp.service'

const sendReminder = async (type: '24h' | '1h', windowStart: Date, windowEnd: Date) => {
  const { data: apts } = await supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, client_id, barber_id, final_price, clients(name, whatsapp), services(name), barbershops(meta_phone_id, meta_access_token, is_active)')
    .gte('scheduled_at', windowStart.toISOString())
    .lte('scheduled_at', windowEnd.toISOString())
    .eq('status', 'confirmed')

  for (const apt of apts ?? []) {
    const shop   = (apt as any).barbershops
    const client = (apt as any).clients
    const svc    = (apt as any).services

    if (!shop?.is_active || !client?.whatsapp) continue

    const { data: exists } = await supabaseAdmin
      .from('appointment_reminders')
      .select('id')
      .eq('appointment_id', apt.id)
      .eq('type', type)
      .maybeSingle()

    if (exists) continue

    const time = new Date(apt.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const date = new Date(apt.scheduled_at).toLocaleDateString('pt-BR')

    const msg = type === '24h'
      ? `⏰ Olá, ${client.name}! Lembrete do seu agendamento amanhã.\n📅 ${date} às ${time}\n✂️ ${svc.name}\n\nTe esperamos! 💈`
      : `⏰ ${client.name}, seu horário é em 1 hora!\n🕐 ${time} — ${svc.name}\n\nTe esperamos! 💈`

    await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, client.whatsapp, msg)

    await supabaseAdmin.from('appointment_reminders').insert({
      appointment_id: apt.id, type, sent_at: new Date().toISOString(), status: 'sent'
    })
  }
}

export const startReminderJob = () => {
  cron.schedule('*/30 * * * *', async () => {
    const now = new Date()

    // Lembrete 24h
    const h24     = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const h24end  = new Date(h24.getTime() + 30 * 60 * 1000)
    await sendReminder('24h', h24, h24end)

    // Lembrete 1h
    const h1    = new Date(now.getTime() + 60 * 60 * 1000)
    const h1end = new Date(h1.getTime() + 30 * 60 * 1000)
    await sendReminder('1h', h1, h1end)
  })

  console.log('⚙️  Job: lembretes WhatsApp (a cada 30min)')
}
