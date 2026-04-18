import { supabaseAdmin } from '../../config/supabase'
import {
  sendNotification,
  tplAppointmentConfirmed,
  tplAppointmentConfirmedBarber,
  tplAppointmentCancelled,
  formatDateBR,
  formatTimeBR,
  getSettings,
} from '../../services/notification.service'

export const appointmentsService = {

  async getAvailableSlots(barbershopId: string, barberId: string, serviceId: string, date: string) {
    const { data: svc } = await supabaseAdmin.from('services').select('duration_min').eq('id', serviceId).single()
    if (!svc) throw new Error('Serviço não encontrado')

    const { data: existing } = await supabaseAdmin
      .from('appointments')
      .select('scheduled_at, ends_at')
      .eq('barber_id', barberId)
      .gte('scheduled_at', `${date}T00:00:00Z`)
      .lte('scheduled_at', `${date}T23:59:59Z`)
      .neq('status', 'cancelled')

    const slots: string[] = []
    for (let h = 8; h < 19; h++) {
      for (let m = 0; m < 60; m += 30) {
        const start = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
        const end   = new Date(start.getTime() + svc.duration_min * 60000)
        const conflict = existing?.some(a => start < new Date(a.ends_at) && end > new Date(a.scheduled_at))
        if (!conflict && end.getHours() <= 19) slots.push(start.toISOString())
      }
    }
    return slots
  },

  async create(barbershopId: string, data: any) {
    const { data: svc } = await supabaseAdmin
      .from('services')
      .select('price, duration_min, name')
      .eq('id', data.serviceId)
      .single()
    if (!svc) throw new Error('Serviço não encontrado')

    const start = new Date(data.scheduledAt)
    const end   = new Date(start.getTime() + svc.duration_min * 60000)

    const { data: apt, error } = await supabaseAdmin
      .from('appointments')
      .insert({
        barbershop_id: barbershopId,
        client_id:     data.clientId,
        barber_id:     data.barberId,
        service_id:    data.serviceId,
        scheduled_at:  start.toISOString(),
        duration_min:  svc.duration_min,
        ends_at:       end.toISOString(),
        price:         svc.price,
        final_price:   svc.price,
        source:        data.source ?? 'dashboard',
        status:        'confirmed',
      })
      .select(`
        id, scheduled_at,
        clients(id, name, whatsapp),
        services(name),
        barber_profiles(users(name, phone)),
        barbershops(id, name, slug, address, whatsapp, notification_settings, meta_phone_id, meta_access_token)
      `)
      .single()

    if (error) throw new Error(error.message)

    // ─── Notificações ───────────────────────────────────────────────────────
    setImmediate(() => this._notifyAppointmentConfirmed(apt).catch(console.error))

    return apt
  },

  async _notifyAppointmentConfirmed(apt: any) {
    const shop: any   = apt.barbershops
    const client: any = apt.clients
    const service: any = apt.services
    const barber: any = apt.barber_profiles

    if (!shop?.meta_phone_id || !shop?.meta_access_token) return

    const settings    = getSettings(shop)
    const barberName  = barber?.users?.name || 'Profissional'
    const barberPhone = barber?.users?.phone
    const clientPhone = client?.whatsapp
    const dateStr     = formatDateBR(apt.scheduled_at)
    const timeStr     = formatTimeBR(apt.scheduled_at)

    // Mensagem para o cliente
    if (settings.appointment_confirmed && clientPhone) {
      await sendNotification({
        barbershopId:   shop.id,
        type:           'appointment_confirmed',
        referenceId:    apt.id,
        referenceDate:  apt.scheduled_at.split('T')[0],
        recipientPhone: clientPhone,
        phoneNumberId:  shop.meta_phone_id,
        accessToken:    shop.meta_access_token,
        message:        tplAppointmentConfirmed({
          clientName:  client.name || 'Cliente',
          shopName:    shop.name,
          serviceName: service?.name || 'Serviço',
          barberName,
          date:        dateStr,
          time:        timeStr,
          slug:        shop.slug || '',
        }),
      })
    }

    // Mensagem para o barbeiro
    if (settings.appointment_confirmed && barberPhone) {
      await sendNotification({
        barbershopId:   shop.id,
        type:           'appointment_confirmed',
        referenceId:    `barber-${apt.id}`,
        referenceDate:  apt.scheduled_at.split('T')[0],
        recipientPhone: barberPhone,
        phoneNumberId:  shop.meta_phone_id,
        accessToken:    shop.meta_access_token,
        message:        tplAppointmentConfirmedBarber({
          barberName,
          clientName:  client.name || 'Cliente',
          serviceName: service?.name || 'Serviço',
          date:        dateStr,
          time:        timeStr,
        }),
      })
    }
  },

  async complete(id: string, barbershopId: string, paymentMethod: string) {
    const { data: apt } = await supabaseAdmin
      .from('appointments')
      .update({ status: 'completed', payment_method: paymentMethod, paid_at: new Date().toISOString() })
      .eq('id', id)
      .eq('barbershop_id', barbershopId)
      .select('*, barber_profiles(commission_value, commission_type), client_id, final_price, barber_id')
      .single()

    if (!apt) throw new Error('Agendamento não encontrado')

    const bp  = (apt as any).barber_profiles
    const com = bp.commission_type === 'percentage'
      ? (apt.final_price * bp.commission_value) / 100
      : bp.commission_value

    await supabaseAdmin.from('transactions').insert({
      barbershop_id:    barbershopId,
      appointment_id:   id,
      type:             'income',
      category:         'serviço',
      description:      `Atendimento #${id.slice(-6)}`,
      amount:           apt.final_price,
      payment_method:   paymentMethod,
      barber_id:        apt.barber_id,
      commission_amount: com,
      net_amount:       apt.final_price - com,
      transaction_date: new Date().toISOString().split('T')[0],
    })

    const pts = Math.floor(apt.final_price)
    const { data: cl } = await supabaseAdmin.from('clients').select('loyalty_points').eq('id', apt.client_id).single()
    await supabaseAdmin.from('loyalty_transactions').insert({
      barbershop_id: barbershopId,
      client_id:     apt.client_id,
      appointment_id: id,
      action:        'earn',
      points:        pts,
      balance_before: cl?.loyalty_points ?? 0,
      balance_after:  (cl?.loyalty_points ?? 0) + pts,
      description:   'Pontos pelo atendimento',
    })
    await supabaseAdmin.from('clients').update({ loyalty_points: (cl?.loyalty_points ?? 0) + pts }).eq('id', apt.client_id)

    return apt
  },

  async cancel(id: string, barbershopId: string, reason?: string) {
    const { data: apt, error } = await supabaseAdmin
      .from('appointments')
      .update({
        status:           'cancelled',
        cancelled_reason: reason ?? null,
        cancelled_at:     new Date(),
      })
      .eq('id', id)
      .eq('barbershop_id', barbershopId)
      .select(`
        id, scheduled_at,
        clients(id, name, whatsapp),
        services(name),
        barbershops(id, name, whatsapp, notification_settings, meta_phone_id, meta_access_token)
      `)
      .single()

    if (error) throw new Error(error.message)

    // ─── Notificação de cancelamento ────────────────────────────────────────
    setImmediate(() => this._notifyAppointmentCancelled(apt).catch(console.error))

    return apt
  },

  async _notifyAppointmentCancelled(apt: any) {
    const shop: any   = apt.barbershops
    const client: any = apt.clients
    const service: any = apt.services

    if (!shop?.meta_phone_id || !shop?.meta_access_token) return

    const settings    = getSettings(shop)
    const clientPhone = client?.whatsapp

    if (!settings.appointment_cancelled || !clientPhone) return

    await sendNotification({
      barbershopId:   shop.id,
      type:           'appointment_cancelled',
      referenceId:    `cancel-${apt.id}`,
      referenceDate:  apt.scheduled_at.split('T')[0],
      recipientPhone: clientPhone,
      phoneNumberId:  shop.meta_phone_id,
      accessToken:    shop.meta_access_token,
      message:        tplAppointmentCancelled({
        clientName:  client.name || 'Cliente',
        shopName:    shop.name,
        serviceName: service?.name || 'Serviço',
        date:        formatDateBR(apt.scheduled_at),
        time:        formatTimeBR(apt.scheduled_at),
      }),
    })
  },
}
