import { supabaseAdmin } from '../../config/supabase'

export const subscriptionsService = {
  async getActiveByClient(clientId: string, barbershopId: string) {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        clients(id, name, phone, whatsapp),
        plans(*),
        subscription_cycles(
          *,
          subscription_cycle_service_balances(*, services(id, name))
        ),
        subscription_invoices(*)
      `)
      .eq('client_id', clientId)
      .eq('barbershop_id', barbershopId)
      .in('status', ['active', 'trialing', 'past_due', 'paused', 'pending_activation'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw new Error(error.message)

    return Array.isArray(data) && data.length ? data[0] : null
  },

  async create(barbershopId: string, body: any) {
    const {
      client_id,
      plan_id,
      gateway_provider,
      payment_method = null,
      due_at = null,
      billing_customer_id = null,
      external_checkout_id = null,
      external_subscription_id = null,
    } = body

    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('id', client_id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (clientError || !client) throw new Error('Cliente não encontrado')

    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('id', plan_id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (planError || !plan) throw new Error('Plano não encontrado')

    const { data, error } = await supabaseAdmin.rpc('create_subscription_with_initial_invoice', {
      p_barbershop_id: barbershopId,
      p_client_id: client_id,
      p_plan_id: plan_id,
      p_gateway_provider: gateway_provider,
      p_payment_method: payment_method,
      p_due_at: due_at,
      p_started_at: new Date().toISOString(),
      p_billing_customer_id: billing_customer_id,
      p_external_checkout_id: external_checkout_id,
      p_external_subscription_id: external_subscription_id,
    })

    if (error) throw new Error(error.message)

    const result = Array.isArray(data) ? data[0] : data
    if (!result?.subscription_id) return result

    await supabaseAdmin
      .from('subscriptions')
      .update({ barbershop_id: barbershopId })
      .eq('id', result.subscription_id)

    await supabaseAdmin
      .from('subscription_invoices')
      .update({ barbershop_id: barbershopId })
      .eq('subscription_id', result.subscription_id)

    const { data: fullData, error: fullError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        clients(id, name, phone, whatsapp),
        plans(*),
        subscription_cycles(*),
        subscription_invoices(*)
      `)
      .eq('id', result.subscription_id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (fullError) throw new Error(fullError.message)

    return fullData
  },

  async generateNextCycle(id: string, barbershopId: string, dueAt: string) {
    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('id', id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (subError || !sub) throw new Error('Assinatura não encontrada')

    const { data, error } = await supabaseAdmin.rpc('generate_next_subscription_cycle_invoice', {
      p_subscription_id: id,
      p_due_at: dueAt,
    })

    if (error) throw new Error(error.message)

    await supabaseAdmin
      .from('subscription_invoices')
      .update({ barbershop_id: barbershopId })
      .eq('subscription_id', id)
      .is('barbershop_id', null)

    return Array.isArray(data) ? data[0] : data
  },

  async consume(id: string, barbershopId: string, body: any) {
    const {
      appointment_id,
      consumed_type,
      service_id = null,
      quantity = 1,
      notes = null,
    } = body

    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, client_id')
      .eq('id', id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (subError || !sub) throw new Error('Assinatura não encontrada')

    const { data: apt, error: aptError } = await supabaseAdmin
      .from('appointments')
      .select('id, client_id, service_id')
      .eq('id', appointment_id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (aptError || !apt) throw new Error('Agendamento não encontrado')
    if (apt.client_id !== sub.client_id) throw new Error('O cliente do agendamento não corresponde ao cliente da assinatura')

    const { data, error } = await supabaseAdmin.rpc('consume_subscription_benefit', {
      p_subscription_id: id,
      p_appointment_id: appointment_id,
      p_consumed_type: consumed_type,
      p_service_id: service_id,
      p_quantity: quantity,
      p_notes: notes,
    })

    if (error) throw new Error(error.message)

    return data
  }
}
