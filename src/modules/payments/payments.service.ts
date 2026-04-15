import { supabaseAdmin } from '../../config/supabase'

export const paymentsService = {
  async processWebhook(body: any, headers: any) {
    const provider = body.provider || 'gateway'
    const eventType = body.event || body.type || 'unknown'
    const externalEventId = body.id || null
    const externalObjectId = body.payment?.id || body.data?.id || null

    const { data: eventData, error: eventError } = await supabaseAdmin.rpc('register_payment_webhook_event', {
      p_provider: provider,
      p_event_type: eventType,
      p_external_event_id: externalEventId,
      p_external_object_id: externalObjectId,
      p_payload: body,
      p_headers: headers,
    })

    if (eventError) throw new Error(eventError.message)

    const externalInvoiceId =
      body.invoice_id ||
      body.payment?.invoice_id ||
      body.data?.invoice_id ||
      null

    if (eventType === 'payment_confirmed' && externalInvoiceId) {
      const { error } = await supabaseAdmin.rpc('mark_subscription_invoice_paid', {
        p_provider: provider,
        p_external_invoice_id: externalInvoiceId,
        p_paid_at: new Date().toISOString(),
        p_payment_url: body.payment_url || null,
        p_gateway_payload: body,
      })

      if (error) throw new Error(error.message)
    }

    if (eventType === 'payment_failed' && externalInvoiceId) {
      const { error } = await supabaseAdmin.rpc('mark_subscription_invoice_failed', {
        p_provider: provider,
        p_external_invoice_id: externalInvoiceId,
        p_failure_reason: body.failure_reason || 'Falha informada pelo gateway',
        p_gateway_payload: body,
      })

      if (error) throw new Error(error.message)
    }

    return { ok: true, event: eventData }
  },

  async createManualInvoice(barbershopId: string, body: any) {
    const {
      subscription_id,
      amount_cents,
      due_at,
      payment_method = null,
      payment_url = null,
      gateway_provider = null,
    } = body

    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('id', subscription_id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (subError || !subscription) throw new Error('Assinatura não encontrada')

    const { data, error } = await supabaseAdmin
      .from('subscription_invoices')
      .insert({
        subscription_id,
        barbershop_id: barbershopId,
        subscription_cycle_id: null,
        billing_reason: 'manual',
        amount_cents,
        currency: 'BRL',
        status: 'pending',
        due_at,
        payment_method,
        payment_url,
        gateway_provider,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return data
  },

  async changeInvoiceStatus(invoiceId: string, barbershopId: string, status: string) {
    const { data, error } = await supabaseAdmin
      .from('subscription_invoices')
      .update({ status })
      .eq('id', invoiceId)
      .eq('barbershop_id', barbershopId)
      .select()
      .single()

    if (error) throw new Error(error.message)

    return data
  },
}
