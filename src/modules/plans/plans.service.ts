import { supabaseAdmin } from '../../config/supabase'

function toTrimmedString(value: any) {
  return String(value ?? '').trim()
}

function parseNonNegativeInteger(value: any, fieldLabel: string, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback

  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} deve ser um número inteiro maior ou igual a zero.`)
  }

  return parsed
}

function parseBillingInterval(value: any) {
  return String(value) === 'year' ? 'year' : 'month'
}

function parsePrice(value: any) {
  const raw = String(value ?? '')
    .trim()
    .replace(',', '.')

  if (!raw) {
    throw new Error('Preço é obrigatório.')
  }

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error('Preço inválido. Use o formato 69,90.')
  }

  const parsed = Number(raw)

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Preço inválido. Use o formato 69,90.')
  }

  return Number(parsed.toFixed(2))
}

function normalizePlanPayload(body: any) {
  const name = toTrimmedString(body.name)
  const description = toTrimmedString(body.description)
  const price = parsePrice(body.price)

  if (!name) {
    throw new Error('Nome é obrigatório.')
  }

  if (name.length > 100) {
    throw new Error('Nome deve ter no máximo 100 caracteres.')
  }

  if (description.length > 500) {
    throw new Error('Descrição deve ter no máximo 500 caracteres.')
  }

  return {
    name,
    description: description || null,
    price,
    price_cents: Math.round(price * 100),
    currency: toTrimmedString(body.currency) || 'BRL',
    billing_interval: parseBillingInterval(body.billing_interval),
    billing_interval_count: parseNonNegativeInteger(body.billing_interval_count, 'Periodicidade', 1) || 1,
    included_haircuts: parseNonNegativeInteger(body.included_haircuts, 'Cortes incluídos', 0),
    included_beards: parseNonNegativeInteger(body.included_beards, 'Barbas incluídas', 0),
    signup_fee_cents: parseNonNegativeInteger(body.signup_fee_cents, 'Taxa de adesão', 0),
    grace_days: parseNonNegativeInteger(body.grace_days, 'Carência', 0),
    is_active: body.is_active === undefined ? true : Boolean(body.is_active),
  }
}

export const plansService = {
  async create(barbershopId: string, body: any) {
    const {
      service_entitlements = [],
    } = body

    const normalizedPlanBody = normalizePlanPayload(body)

    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .insert({
        ...normalizedPlanBody,
        barbershop_id: barbershopId,
      })
      .select()
      .single()

    if (planError) throw new Error(planError.message)

    if (Array.isArray(service_entitlements) && service_entitlements.length > 0) {
      const payload = service_entitlements.map((item: any) => ({
        plan_id: plan.id,
        service_id: item.service_id,
        included_quantity: item.included_quantity,
      }))

      const { error: entitlementsError } = await supabaseAdmin
        .from('plan_service_entitlements')
        .insert(payload)

      if (entitlementsError) throw new Error(entitlementsError.message)
    }

    const { data, error } = await supabaseAdmin
      .from('plans')
      .select(`
        *,
        plan_service_entitlements(*, services(id, name))
      `)
      .eq('id', plan.id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (error) throw new Error(error.message)

    return data
  },

  async update(id: string, barbershopId: string, body: any) {
    const {
      service_entitlements,
    } = body

    const normalizedPlanBody = normalizePlanPayload(body)

    const { data: existingPlan, error: existingError } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('id', id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (existingError) throw new Error(existingError.message)

    const { error: updateError } = await supabaseAdmin
      .from('plans')
      .update(normalizedPlanBody)
      .eq('id', existingPlan.id)
      .eq('barbershop_id', barbershopId)

    if (updateError) throw new Error(updateError.message)

    if (Array.isArray(service_entitlements)) {
      const { error: deleteError } = await supabaseAdmin
        .from('plan_service_entitlements')
        .delete()
        .eq('plan_id', existingPlan.id)

      if (deleteError) throw new Error(deleteError.message)

      if (service_entitlements.length > 0) {
        const payload = service_entitlements.map((item: any) => ({
          plan_id: existingPlan.id,
          service_id: item.service_id,
          included_quantity: item.included_quantity,
        }))

        const { error: insertError } = await supabaseAdmin
          .from('plan_service_entitlements')
          .insert(payload)

        if (insertError) throw new Error(insertError.message)
      }
    }

    const { data, error } = await supabaseAdmin
      .from('plans')
      .select(`
        *,
        plan_service_entitlements(*, services(id, name))
      `)
      .eq('id', existingPlan.id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (error) throw new Error(error.message)

    return data
  }
}
