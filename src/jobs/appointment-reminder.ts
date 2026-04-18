import { supabaseAdmin } from '../config/supabase'
import {
  sendNotification,
  tplAppointmentReminder1h,
  formatTimeBR,
  getSettings,
} from '../services/notification.service'

export async function runAppointmentReminder(): Promise<void> {
  // Janela: agendamentos que iniciam entre 55 e 65 minutos a partir de agora
  const now     = new Date()
  const from    = new Date(now.getTime() + 55 * 60_000)
  const to      = new Date(now.getTime() + 65 * 60_000)

  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      id, scheduled_at,
      clients(id, name, whatsapp),
      services(name),
      barber_profiles(users(name, phone)),
      barbershops(id, name, address, whatsapp, notification_settings, meta_phone_id, meta_access_token)
    `)
    .gte('scheduled_at', from.toISOString())
    .lte('scheduled_at', to.toISOString())
    .in('status', ['confirmed', 'pending'])

  if (error) { console.error('❌ appointment-reminder query:', error.message); return }

  for (const apt of appointments ?? []) {
    const shop: any    = apt.barbershops
    const client: any  = apt.clients
    const service: any = apt.services
    const barber: any  = apt.barber_profiles

    if (!shop?.meta_phone_id || !shop?.meta_access_token) continue

    const settings = getSettings(shop)
    if (!settings.appointment_reminder_1h) continue

    const barberName   = barber?.users?.name || 'Profissional'
    const clientPhone  = client?.whatsapp
    const time         = formatTimeBR(apt.scheduled_at)

    // Envia para o cliente
    if (clientPhone) {
      const message = tplAppointmentReminder1h({
        clientName:  client.name || 'Cliente',
        shopName:    shop.name,
        serviceName: service?.name || 'Serviço',
        barberName,
        time,
        address:     shop.address || 'Consulte o endereço no aplicativo',
      })

      await sendNotification({
        barbershopId:   shop.id,
        type:           'appointment_reminder_1h',
        referenceId:    apt.id,
        referenceDate:  apt.scheduled_at.split('T')[0],
        recipientPhone: clientPhone,
        phoneNumberId:  shop.meta_phone_id,
        accessToken:    shop.meta_access_token,
        message,
      })
    }
  }
}
