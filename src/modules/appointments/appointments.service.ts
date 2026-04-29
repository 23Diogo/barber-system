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

// ─── Helper: converte "HH:MM" em minutos desde meia-noite ─────────────────────

function timeToMinutes(t: string | null | undefined, defaultHour: number): number {
  if (!t) return defaultHour * 60
  const [h, m] = t.split(':').map(Number)
  return (Number.isFinite(h) ? h : defaultHour) * 60 + (Number.isFinite(m) ? m : 0)
}

export const appointmentsService = {

  async getAvailableSlots(
    barbershopId: string,
    barberId: string,
    serviceId: string,
    date: string
  ) {
    // ── Busca serviço e horário do barbeiro em paralelo ──────────────────────
    const [svcResult, barberResult, barbershopResult] = await Promise.all([
      supabaseAdmin
        .from('services')
        .select('duration_min')
        .eq('id', serviceId)
        .single(),
      supabaseAdmin
        .from('barber_profiles')
        .select('working_hours')
        .eq('id', barberId)
        .single(),
      supabaseAdmin
        .from('barbershops')
        .select('working_hours')
        .eq('id', barbershopId)
        .single(),
    ])

    if (!svcResult.data) throw new Error('Serviço não encontrado')

    const durationMin = Number(svcResult.data.duration_min || 30)

    // Usa horários do barbeiro se configurados, senão usa da barbearia, senão fallback
    const barberWh    = barberResult.data?.working_hours || {}
    const shopWh      = barbershopResult.data?.working_hours || {}

    // Determina o dia da semana para buscar horário específico do dia
    const requestedDate = new Date(`${date}T12:00:00`)
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = dayNames[requestedDate.getDay()]

    // Tenta pegar horário do dia específico na barbearia
    const shopDayConfig = shopWh[dayName]
    const shopDayEnabled = shopDayConfig?.enabled !== false && shopDayConfig?.isOpen !== false

    // Se a barbearia tem config do dia e está fechada, retorna vazio
    if (shopDayConfig && !shopDayEnabled) {
      return []
    }

    // Horários: prioriza barbeiro, depois barbearia, depois fallback
    const startMin = barberWh.start
      ? timeToMinutes(barberWh.start, 8)
      : shopDayConfig?.start
        ? timeToMinutes(shopDayConfig.start, 8)
        : shopWh.start
          ? timeToMinutes(shopWh.start, 8)
          : 8 * 60

    const endMin = barberWh.end
      ? timeToMinutes(barberWh.end, 19)
      : shopDayConfig?.end
        ? timeToMinutes(shopDayConfig.end, 19)
        : shopWh.end
          ? timeToMinutes(shopWh.end, 19)
          : 19 * 60

    const interval      = Number(barberWh.slot_interval || shopWh.slot_interval || 30)
    const hasLunch      = Boolean(barberWh.lunch_start && barberWh.lunch_end)
    const lunchStartMin = hasLunch ? timeToMinutes(barberWh.lunch_start, 12) : null
    const lunchEndMin   = hasLunch ? timeToMinutes(barberWh.lunch_end,   13) : null

    // ── Agendamentos existentes do barbeiro neste dia ────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('appointments')
      .select('scheduled_at, ends_at')
      .eq('barber_id', barberId)
      .gte('scheduled_at', `${date}T00:00:00`)
      .lte('scheduled_at', `${date}T23:59:59`)
      .neq('status', 'cancelled')

    const now = Date.now()

    // ── Gera slots dentro do horário de trabalho ─────────────────────────────
    const slots: string[] = []

    for (let minute = startMin; minute < endMin; minute += interval) {
      const slotEndMin = minute + durationMin

      // Slot não cabe dentro do horário de trabalho
      if (slotEndMin > endMin) break

      // Slot cai no horário de almoço
      if (lunchStartMin !== null && lunchEndMin !== null) {
        if (minute < lunchEndMin && slotEndMin > lunchStartMin) continue
      }

      const h     = Math.floor(minute / 60)
      const m     = minute % 60
      const start = new Date(
        `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
      )
      const end = new Date(start.getTime() + durationMin * 60_000)

      // ✅ Filtra slots que já passaram (para o dia de hoje)
      if (start.getTime() <= now) continue

      // Verifica conflito com agendamentos já existentes
      const conflict = existing?.some(
        a => start < new Date(a.ends_at) && end > new Date(a.scheduled_at)
      )

      if (!conflict) slots.push(start.toISOString())
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

    setImmediate(() => this._notifyAppointmentConfirmed(apt).catch(console.error))

    return apt
  },

  async _notifyAppointmentConfirmed(apt: any) {
    const shop: any    = apt.barbershops
    const client: any  = apt.clients
    const service: any = apt.services
    const barber: any  = apt.barber_profiles

    if (!shop?.meta_phone_id || !shop?.meta_access_token) return

    const settings    = getSettings(shop)
    const barberName  = barber?.users?.name || 'Profissional'
    const barberPhone = barber?.users?.phone
    const clientPhone = client?.whatsapp
    const dateStr     = formatDateBR(apt.scheduled_at)
    const timeStr     = formatTimeBR(apt.scheduled_at)

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
    const { data: cl } = await supabaseAdmin
      .from('clients')
      .select('loyalty_points')
      .eq('id', apt.client_id)
      .single()

    await supabaseAdmin.from('loyalty_transactions').insert({
      barbershop_id:  barbershopId,
      client_id:      apt.client_id,
      appointment_id: id,
      action:         'earn',
      points:         pts,
      balance_before: cl?.loyalty_points ?? 0,
      balance_after:  (cl?.loyalty_points ?? 0) + pts,
      description:    'Pontos pelo atendimento',
    })

    await supabaseAdmin
      .from('clients')
      .update({ loyalty_points: (cl?.loyalty_points ?? 0) + pts })
      .eq('id', apt.client_id)

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

    setImmediate(() => this._notifyAppointmentCancelled(apt).catch(console.error))

    return apt
  },

  async _notifyAppointmentCancelled(apt: any) {
    const shop: any    = apt.barbershops
    const client: any  = apt.clients
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
