import { supabaseAdmin } from '../../config/supabase'
import { ClientAuthPayload } from '../../middleware/client-auth'
import { appointmentsService } from '../appointments/appointments.service'
import { subscriptionsService } from '../subscriptions/subscriptions.service'

type PortalBarberListInput = {
  serviceId?: string
}

type PortalSlotsInput = {
  barberId: string
  serviceId: string
  date: string
}

type CreatePortalAppointmentInput = {
  serviceId: string
  barberId: string
  scheduledAt: string
  notes?: string | null
}

type ConsumptionType = 'haircut' | 'beard' | 'service' | null

function normalizeText(value: any) {
  return String(value ?? '').trim()
}

function normalizeLower(value: any) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value: any, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toCents(value: any) {
  return Math.round(toNumber(value, 0) * 100)
}

function getUserObject(value: any) {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function isFutureDate(date: Date) {
  return date.getTime() > Date.now()
}

function diffHours(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60)
}

function pickCurrentCycle(subscription: any) {
  if (!subscription?.subscription_cycles || !Array.isArray(subscription.subscription_cycles)) {
    return null
  }

  const now = new Date()

  const eligible = subscription.subscription_cycles.filter((cycle: any) => {
    const start = cycle?.period_start ? new Date(cycle.period_start) : null
    const end = cycle?.period_end ? new Date(cycle.period_end) : null

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false
    }

    return ['open', 'paid'].includes(String(cycle.status || '')) && start <= now && end > now
  })

  if (eligible.length) {
    return eligible.sort((a: any, b: any) => {
      return new Date(b.period_start).getTime() - new Date(a.period_start).getTime()
    })[0]
  }

  return [...subscription.subscription_cycles].sort((a: any, b: any) => {
    return new Date(b.period_start || 0).getTime() - new Date(a.period_start || 0).getTime()
  })[0] || null
}

function inferConsumptionType(service: any): ConsumptionType {
  const raw = [
    service?.category,
    service?.type,
    service?.kind,
    service?.slug,
    service?.name,
  ]
    .filter(Boolean)
    .map(normalizeLower)
    .join(' ')

  if (!raw) return null

  if (
    raw.includes('barba') ||
    raw.includes('beard')
  ) {
    return 'beard'
  }

  if (
    raw.includes('corte') ||
    raw.includes('haircut') ||
    raw.includes('degrade') ||
    raw.includes('degradê')
  ) {
    return 'haircut'
  }

  return null
}

function getServiceCoverage(service: any, subscription: any) {
  const currentCycle = pickCurrentCycle(subscription)

  if (!subscription || !currentCycle) {
    return {
      includedInPlan: false,
      consumedType: null as ConsumptionType,
      remainingQuantity: null as number | null,
      subscription: subscription || null,
      currentCycle: currentCycle || null,
    }
  }

  const balances = Array.isArray(currentCycle.subscription_cycle_service_balances)
    ? currentCycle.subscription_cycle_service_balances
    : []

  const explicitBalance = balances.find((item: any) => item?.service_id === service?.id)

  if (explicitBalance) {
    const remaining = Number(explicitBalance.remaining_quantity || 0)

    return {
      includedInPlan: remaining > 0,
      consumedType: 'service' as ConsumptionType,
      remainingQuantity: remaining,
      subscription,
      currentCycle,
    }
  }

  const inferredType = inferConsumptionType(service)

  if (inferredType === 'haircut') {
    const remaining = Number(currentCycle.remaining_haircuts || 0)

    return {
      includedInPlan: remaining > 0,
      consumedType: remaining > 0 ? 'haircut' : null,
      remainingQuantity: remaining,
      subscription,
      currentCycle,
    }
  }

  if (inferredType === 'beard') {
    const remaining = Number(currentCycle.remaining_beards || 0)

    return {
      includedInPlan: remaining > 0,
      consumedType: remaining > 0 ? 'beard' : null,
      remainingQuantity: remaining,
      subscription,
      currentCycle,
    }
  }

  return {
    includedInPlan: false,
    consumedType: null as ConsumptionType,
    remainingQuantity: null as number | null,
    subscription,
    currentCycle,
  }
}

async function getBarbershopSettings(barbershopId: string) {
  const { data, error } = await supabaseAdmin
    .from('barbershops')
    .select(`
      id,
      name,
      slug,
      logo_url,
      cover_url,
      city,
      timezone,
      working_hours,
      booking_advance_days,
      cancellation_hours,
      is_active,
      absence_message
    `)
    .eq('id', barbershopId)
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Barbearia não encontrada')

  return data
}

async function getClient(auth: ClientAuthPayload) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select(`
      id,
      barbershop_id,
      name,
      email,
      phone,
      whatsapp,
      notes,
      is_active,
      is_vip,
      created_at,
      updated_at
    `)
    .eq('id', auth.clientId)
    .eq('barbershop_id', auth.barbershopId)
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Cliente não encontrado')

  return data
}

async function getActiveSubscription(auth: ClientAuthPayload) {
  return subscriptionsService.getActiveByClient(auth.clientId, auth.barbershopId)
}

async function getServiceOrFail(barbershopId: string, serviceId: string) {
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .eq('barbershop_id', barbershopId)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    throw new Error('Serviço não encontrado')
  }

  return data
}

async function getBarberOrFail(barbershopId: string, barberId: string) {
  const { data, error } = await supabaseAdmin
    .from('barber_profiles')
    .select(`
      id,
      barbershop_id,
      specialties,
      commission_type,
      commission_value,
      working_hours,
      rating_avg,
      rating_count,
      total_cuts,
      is_accepting,
      users(id, name, email, phone, avatar_url)
    `)
    .eq('id', barberId)
    .eq('barbershop_id', barbershopId)
    .single()

  if (error || !data) {
    throw new Error('Profissional não encontrado')
  }

  if (data.is_accepting === false) {
    throw new Error('Este profissional não está aceitando agendamentos no momento')
  }

  return data
}

async function validateBarberServiceRelation(barberId: string, serviceId: string) {
  const { data, error } = await supabaseAdmin
    .from('barber_services')
    .select('barber_id, service_id, custom_price')
    .eq('service_id', serviceId)

  if (error) throw new Error(error.message)

  if (!data || data.length === 0) {
    return { hasExplicitMapping: false, mapping: null }
  }

  const mapping = data.find((item: any) => item.barber_id === barberId) || null

  if (!mapping) {
    throw new Error('Este profissional não atende o serviço selecionado')
  }

  return {
    hasExplicitMapping: true,
    mapping,
  }
}

function pickLatestInvoice(subscription: any) {
  const invoices = Array.isArray(subscription?.subscription_invoices)
    ? [...subscription.subscription_invoices]
    : []

  if (!invoices.length) return null

  return invoices.sort((a: any, b: any) => {
    const aTime = new Date(a?.due_at || a?.created_at || 0).getTime()
    const bTime = new Date(b?.due_at || b?.created_at || 0).getTime()
    return bTime - aTime
  })[0] || null
}

function validateBookingWindow(barbershop: any, scheduledAt: Date) {
  if (!isFutureDate(scheduledAt)) {
    throw new Error('Escolha um horário futuro')
  }

  const bookingAdvanceDays = Number(barbershop?.booking_advance_days || 30)
  const maxAllowed = new Date()
  maxAllowed.setDate(maxAllowed.getDate() + bookingAdvanceDays)
  maxAllowed.setHours(23, 59, 59, 999)

  if (scheduledAt.getTime() > maxAllowed.getTime()) {
    throw new Error(`Esta barbearia permite agendamento com no máximo ${bookingAdvanceDays} dias de antecedência`)
  }
}

async function getNextAppointment(auth: ClientAuthPayload) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      *,
      services(name, duration_min, price),
      barber_profiles(
        id,
        users(name, avatar_url)
      )
    `)
    .eq('barbershop_id', auth.barbershopId)
    .eq('client_id', auth.clientId)
    .gte('scheduled_at', new Date().toISOString())
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true })
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0] || null
}

async function reloadAppointment(barbershopId: string, appointmentId: string) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select(`
      *,
      services(name, duration_min, price),
      barber_profiles(
        id,
        users(name, avatar_url)
      ),
      clients(name, phone, whatsapp)
    `)
    .eq('id', appointmentId)
    .eq('barbershop_id', barbershopId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export const clientPortalService = {
  async getContext(auth: ClientAuthPayload) {
    const [client, barbershop, subscription, nextAppointment] = await Promise.all([
      getClient(auth),
      getBarbershopSettings(auth.barbershopId),
      getActiveSubscription(auth),
      getNextAppointment(auth),
    ])

    const currentCycle = pickCurrentCycle(subscription)

    return {
      client,
      barbershop,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            planId: subscription.plan_id,
            planName: subscription.plans?.name || null,
            currentCycle: currentCycle
              ? {
                  id: currentCycle.id,
                  periodStart: currentCycle.period_start,
                  periodEnd: currentCycle.period_end,
                  remainingHaircuts: currentCycle.remaining_haircuts,
                  remainingBeards: currentCycle.remaining_beards,
                }
              : null,
          }
        : null,
      nextAppointment,
    }
  },

  async listServices(auth: ClientAuthPayload) {
    const [subscription, { data, error }] = await Promise.all([
      getActiveSubscription(auth),
      supabaseAdmin
        .from('services')
        .select('*')
        .eq('barbershop_id', auth.barbershopId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ])

    if (error) throw new Error(error.message)

    const services = (data || []).map((service: any) => {
      const coverage = getServiceCoverage(service, subscription)

      return {
        ...service,
        includedInPlan: coverage.includedInPlan,
        planRemainingQuantity: coverage.remainingQuantity,
        planConsumedType: coverage.consumedType,
      }
    })

    return {
      items: services,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            planId: subscription.plan_id,
            planName: subscription.plans?.name || null,
          }
        : null,
    }
  },

  async listBarbers(auth: ClientAuthPayload, input: PortalBarberListInput) {
    const serviceId = normalizeText(input.serviceId)

    if (serviceId) {
      await getServiceOrFail(auth.barbershopId, serviceId)
    }

    const { data, error } = await supabaseAdmin
      .from('barber_profiles')
      .select(`
        id,
        specialties,
        rating_avg,
        rating_count,
        total_cuts,
        is_accepting,
        users(id, name, email, phone, avatar_url)
      `)
      .eq('barbershop_id', auth.barbershopId)
      .eq('is_accepting', true)

    if (error) throw new Error(error.message)

    const barbers = data || []

    if (!serviceId) {
      return {
        items: [...barbers]
          .sort((a: any, b: any) => {
            const nameA = normalizeLower(getUserObject(a.users)?.name)
            const nameB = normalizeLower(getUserObject(b.users)?.name)
            return nameA.localeCompare(nameB)
          })
          .map((barber: any) => ({
            ...barber,
            user: getUserObject(barber.users),
          })),
      }
    }

    const { data: mappings, error: mappingsError } = await supabaseAdmin
      .from('barber_services')
      .select('barber_id, service_id, custom_price')
      .eq('service_id', serviceId)

    if (mappingsError) throw new Error(mappingsError.message)

    const mappingList = mappings || []

    if (mappingList.length === 0) {
      return {
        items: [...barbers]
          .sort((a: any, b: any) => {
            const nameA = normalizeLower(getUserObject(a.users)?.name)
            const nameB = normalizeLower(getUserObject(b.users)?.name)
            return nameA.localeCompare(nameB)
          })
          .map((barber: any) => ({
            ...barber,
            user: getUserObject(barber.users),
            canPerformSelectedService: true,
            customPrice: null,
          })),
      }
    }

    const mappingByBarberId = new Map(
      mappingList.map((item: any) => [item.barber_id, item])
    )

    return {
      items: [...barbers]
        .filter((barber: any) => mappingByBarberId.has(barber.id))
        .sort((a: any, b: any) => {
          const nameA = normalizeLower(getUserObject(a.users)?.name)
          const nameB = normalizeLower(getUserObject(b.users)?.name)
          return nameA.localeCompare(nameB)
        })
        .map((barber: any) => {
          const mapping = mappingByBarberId.get(barber.id)

          return {
            ...barber,
            user: getUserObject(barber.users),
            canPerformSelectedService: true,
            customPrice: mapping?.custom_price ?? null,
          }
        }),
    }
  },

  async getAvailableSlots(auth: ClientAuthPayload, input: PortalSlotsInput) {
    const barberId = normalizeText(input.barberId)
    const serviceId = normalizeText(input.serviceId)
    const date = normalizeText(input.date)

    if (!barberId || !serviceId || !date) {
      throw new Error('barberId, serviceId e date são obrigatórios')
    }

    const [barbershop] = await Promise.all([
      getBarbershopSettings(auth.barbershopId),
      getServiceOrFail(auth.barbershopId, serviceId),
      getBarberOrFail(auth.barbershopId, barberId),
      validateBarberServiceRelation(barberId, serviceId),
    ])

    if (!barbershop.is_active) {
      throw new Error(barbershop.absence_message || 'Barbearia indisponível no momento')
    }

    const requestedDate = new Date(`${date}T00:00:00`)
    if (Number.isNaN(requestedDate.getTime())) {
      throw new Error('Data inválida')
    }

    validateBookingWindow(barbershop, requestedDate)

    const slots = await appointmentsService.getAvailableSlots(
      auth.barbershopId,
      barberId,
      serviceId,
      date
    )

    return {
      date,
      slots,
    }
  },

  async createAppointment(auth: ClientAuthPayload, body: CreatePortalAppointmentInput) {
    const serviceId = normalizeText(body.serviceId)
    const barberId = normalizeText(body.barberId)
    const scheduledAtRaw = normalizeText(body.scheduledAt)
    const notes = normalizeText(body.notes)

    if (!serviceId || !barberId || !scheduledAtRaw) {
      throw new Error('serviceId, barberId e scheduledAt são obrigatórios')
    }

    if (notes.length > 280) {
      throw new Error('A observação deve ter no máximo 280 caracteres')
    }

    const scheduledAt = new Date(scheduledAtRaw)
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error('Data/hora inválida')
    }

    const [barbershop, service, barber, subscription] = await Promise.all([
      getBarbershopSettings(auth.barbershopId),
      getServiceOrFail(auth.barbershopId, serviceId),
      getBarberOrFail(auth.barbershopId, barberId),
      getActiveSubscription(auth),
    ])

    if (!barbershop.is_active) {
      throw new Error(barbershop.absence_message || 'Barbearia indisponível no momento')
    }

    validateBookingWindow(barbershop, scheduledAt)

    const relation = await validateBarberServiceRelation(barberId, serviceId)

    const durationMin = Number(service.duration_min || 0)
    if (!durationMin || durationMin <= 0) {
      throw new Error('Duração do serviço inválida')
    }

    const start = new Date(scheduledAt)
    const end = new Date(start.getTime() + durationMin * 60000)

    const { data: conflicts, error: conflictError } = await supabaseAdmin
      .from('appointments')
      .select('id, scheduled_at, ends_at, status')
      .eq('barbershop_id', auth.barbershopId)
      .eq('barber_id', barberId)
      .lt('scheduled_at', end.toISOString())
      .gt('ends_at', start.toISOString())
      .neq('status', 'cancelled')

    if (conflictError) throw new Error(conflictError.message)
    if (conflicts && conflicts.length > 0) {
      throw new Error('Este horário não está mais disponível')
    }

    const coverage = getServiceCoverage(service, subscription)

    const basePrice =
      relation.mapping?.custom_price != null
        ? Number(relation.mapping.custom_price)
        : Number(service.price || 0)

    const billingMode = coverage.includedInPlan ? 'subscription' : 'avulso'
    const chargedAmountCents = coverage.includedInPlan ? 0 : toCents(basePrice)

    const { data: appointment, error: insertError } = await supabaseAdmin
      .from('appointments')
      .insert({
        barbershop_id: auth.barbershopId,
        client_id: auth.clientId,
        barber_id: barberId,
        service_id: serviceId,
        scheduled_at: start.toISOString(),
        duration_min: durationMin,
        ends_at: end.toISOString(),
        price: basePrice,
        final_price: basePrice,
        source: 'client_portal',
        status: 'confirmed',
        notes: notes || null,
        billing_mode: billingMode,
        charged_amount_cents: chargedAmountCents,
      })
      .select(`
        *,
        services(name, duration_min, price),
        barber_profiles(
          id,
          users(name, avatar_url)
        ),
        clients(name, phone, whatsapp)
      `)
      .single()

    if (insertError) throw new Error(insertError.message)

    if (coverage.includedInPlan && coverage.subscription?.id && coverage.consumedType) {
      const { error: consumeError } = await supabaseAdmin.rpc('consume_subscription_benefit', {
        p_subscription_id: coverage.subscription.id,
        p_appointment_id: appointment.id,
        p_consumed_type: coverage.consumedType,
        p_service_id: coverage.consumedType === 'service' ? service.id : null,
        p_quantity: 1,
        p_notes: notes || null,
      })

      if (consumeError) {
        await supabaseAdmin
          .from('appointments')
          .delete()
          .eq('id', appointment.id)
          .eq('barbershop_id', auth.barbershopId)

        throw new Error(consumeError.message)
      }
    }

    const finalAppointment = await reloadAppointment(auth.barbershopId, appointment.id)

    return {
      appointment: finalAppointment,
      billing: {
        billingMode,
        includedInPlan: coverage.includedInPlan,
        planConsumedType: coverage.consumedType,
        chargedAmountCents,
      },
    }
  },

  async listAppointments(auth: ClientAuthPayload) {
    const { data, error } = await supabaseAdmin
      .from('appointments')
      .select(`
        *,
        services(name, duration_min, price),
        barber_profiles(
          id,
          users(name, avatar_url)
        )
      `)
      .eq('barbershop_id', auth.barbershopId)
      .eq('client_id', auth.clientId)
      .order('scheduled_at', { ascending: false })

    if (error) throw new Error(error.message)

    const now = new Date()
    const items = data || []

    const upcoming = items.filter((item: any) => {
      const scheduledAt = item?.scheduled_at ? new Date(item.scheduled_at) : null
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return false

      return (
        scheduledAt >= now &&
        !['cancelled', 'completed'].includes(String(item.status || ''))
      )
    })

    const history = items.filter((item: any) => !upcoming.some((up: any) => up.id === item.id))

    return {
      upcoming,
      history,
    }
  },

  async cancelAppointment(auth: ClientAuthPayload, appointmentId: string, reason?: string) {
    const id = normalizeText(appointmentId)
    if (!id) throw new Error('Agendamento inválido')

    const [barbershop, { data: appointment, error: appointmentError }] = await Promise.all([
      getBarbershopSettings(auth.barbershopId),
      supabaseAdmin
        .from('appointments')
        .select('*')
        .eq('id', id)
        .eq('barbershop_id', auth.barbershopId)
        .eq('client_id', auth.clientId)
        .single(),
    ])

    if (appointmentError || !appointment) {
      throw new Error('Agendamento não encontrado')
    }

    if (String(appointment.status) === 'cancelled') {
      throw new Error('Este agendamento já foi cancelado')
    }

    if (String(appointment.status) === 'completed') {
      throw new Error('Não é possível cancelar um agendamento concluído')
    }

    const scheduledAt = new Date(appointment.scheduled_at)
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error('Data do agendamento inválida')
    }

    const cancellationHours = Number(barbershop?.cancellation_hours || 0)
    const remainingHours = diffHours(new Date(), scheduledAt)

    if (remainingHours < cancellationHours) {
      throw new Error(
        `Cancelamento permitido apenas com no mínimo ${cancellationHours} hora(s) de antecedência`
      )
    }

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_reason: normalizeText(reason) || 'Cancelado pelo cliente',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('barbershop_id', auth.barbershopId)
      .eq('client_id', auth.clientId)
      .select(`
        *,
        services(name, duration_min, price),
        barber_profiles(
          id,
          users(name, avatar_url)
        )
      `)
      .single()

    if (error) throw new Error(error.message)

    return data
  },
}
