import crypto from 'crypto'
import { supabaseAdmin } from '../../config/supabase'

function parseSignatureHeader(signatureHeader: string) {
  const parts = String(signatureHeader || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const values: Record<string, string> = {}

  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key && value) values[key.trim()] = value.trim()
  }

  return {
    ts: values.ts || '',
    v1: values.v1 || '',
  }
}

function validateMercadoPagoSignature({
  secret,
  signatureHeader,
  requestId,
  dataId,
}: {
  secret: string
  signatureHeader: string
  requestId: string
  dataId: string
}) {
  if (!secret) return true

  const { ts, v1 } = parseSignatureHeader(signatureHeader)

  if (!ts || !v1 || !requestId || !dataId) {
    return false
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  const expected = Buffer.from(hash, 'utf8')
  const received = Buffer.from(v1, 'utf8')

  if (expected.length !== received.length) {
    return false
  }

  return crypto.timingSafeEqual(expected, received)
}

async function getMercadoPagoPayment(paymentId: string) {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN não configurado.')

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.message || 'Erro ao consultar pagamento no Mercado Pago')
  }

  return data
}

function mapMercadoPagoStatus(status: string) {
  const value = String(status || '').toLowerCase()

  if (value === 'approved') return 'paid'
  if (value === 'pending' || value === 'in_process' || value === 'authorized') return 'pending'
  if (value === 'cancelled' || value === 'rejected' || value === 'charged_back' || value === 'refunded') {
    return 'failed'
  }

  return 'pending'
}

function mapInvoiceStatusToSubscriptionStatus(invoiceStatus: string) {
  if (invoiceStatus === 'paid') return 'active'
  if (invoiceStatus === 'failed') return 'past_due'
  return null
}

async function syncSubscriptionStatusBySubscriptionId(subscriptionId: string, invoiceStatus: string) {
  const nextSubscriptionStatus = mapInvoiceStatusToSubscriptionStatus(invoiceStatus)
  if (!nextSubscriptionStatus) return

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, status')
    .eq('id', subscriptionId)
    .single()

  if (subscriptionError) throw new Error(subscriptionError.message)
  if (!subscription) return

  if (subscription.status === 'paused' || subscription.status === 'canceled') {
    return
  }

  if (subscription.status === nextSubscriptionStatus) {
    return
  }

  const { error: updateError } = await supabaseAdmin
    .from('subscriptions')
    .update({ status: nextSubscriptionStatus })
    .eq('id', subscriptionId)

  if (updateError) throw new Error(updateError.message)
}

async function syncSubscriptionStatusByExternalInvoiceId(
  provider: string,
  externalInvoiceId: string,
  invoiceStatus: string
) {
  if (!externalInvoiceId) return

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from('subscription_invoices')
    .select('id, subscription_id, external_invoice_id, gateway_provider')
    .eq('external_invoice_id', externalInvoiceId)
    .eq('gateway_provider', provider)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (invoiceError) throw new Error(invoiceError.message)
  if (!invoice?.subscription_id) return

  await syncSubscriptionStatusBySubscriptionId(invoice.subscription_id, invoiceStatus)
}

export const paymentsService = {
  async processWebhook(provider: string, body: any, headers: any, query: any = {}) {
    if (provider === 'mercadopago') {
      const dataId =
        String(query['data.id'] || body?.data?.id || '').trim()

      const eventType =
        String(query.type || query.topic || body?.type || body?.action || 'unknown').trim()

      const signatureHeader = String(headers['x-signature'] || '')
      const requestId = String(headers['x-request-id'] || '')
      const webhookSecret = String(process.env.MP_WEBHOOK_SECRET || '').trim()

      const isValid = validateMercadoPagoSignature({
        secret: webhookSecret,
        signatureHeader,
        requestId,
        dataId,
      })

      if (!isValid) {
        throw new Error('Assinatura do webhook Mercado Pago inválida.')
      }

      if (!dataId) {
        return { ok: true, ignored: true, reason: 'Webhook sem data.id' }
      }

      const payment = await getMercadoPagoPayment(dataId)
      const externalReference = payment.external_reference || null
      const mappedStatus = mapMercadoPagoStatus(payment.status)

      const { data: eventData, error: eventError } = await supabaseAdmin.rpc(
        'register_payment_webhook_event',
        {
          p_provider: 'mercadopago',
          p_event_type: eventType,
          p_external_event_id: payment.id?.toString?.() || null,
          p_external_object_id: payment.id?.toString?.() || null,
          p_payload: payment,
          p_headers: headers,
        }
      )

      if (eventError) throw new Error(eventError.message)

      if (externalReference && mappedStatus === 'paid') {
        const { error } = await supabaseAdmin.rpc('mark_subscription_invoice_paid', {
          p_provider: 'mercadopago',
          p_external_invoice_id: externalReference,
          p_paid_at: payment.date_approved || new Date().toISOString(),
          p_payment_url: null,
          p_gateway_payload: payment,
        })

        if (error) throw new Error(error.message)

        await syncSubscriptionStatusByExternalInvoiceId('mercadopago', externalReference, 'paid')
      }

      if (externalReference && mappedStatus === 'failed') {
        const { error } = await supabaseAdmin.rpc('mark_subscription_invoice_failed', {
          p_provider: 'mercadopago',
          p_external_invoice_id: externalReference,
          p_failure_reason: payment.status_detail || 'Falha informada pelo Mercado Pago',
          p_gateway_payload: payment,
        })

        if (error) throw new Error(error.message)

        await syncSubscriptionStatusByExternalInvoiceId('mercadopago', externalReference, 'failed')
      }

      return {
        ok: true,
        provider: 'mercadopago',
        paymentId: payment.id,
        externalReference,
        status: payment.status,
        mappedStatus,
        event: eventData,
      }
    }

    const eventType = body.event || body.type || 'unknown'
    const externalEventId = body.id || null
    const externalObjectId = body.payment?.id || body.data?.id || null

    const { data: eventData, error: eventError } = await supabaseAdmin.rpc('register_payment_webhook_event', {
      p_provider: provider || 'gateway',
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
        p_provider: provider || 'gateway',
        p_external_invoice_id: externalInvoiceId,
        p_paid_at: new Date().toISOString(),
        p_payment_url: body.payment_url || null,
        p_gateway_payload: body,
      })

      if (error) throw new Error(error.message)

      await syncSubscriptionStatusByExternalInvoiceId(provider || 'gateway', externalInvoiceId, 'paid')
    }

    if (eventType === 'payment_failed' && externalInvoiceId) {
      const { error } = await supabaseAdmin.rpc('mark_subscription_invoice_failed', {
        p_provider: provider || 'gateway',
        p_external_invoice_id: externalInvoiceId,
        p_failure_reason: body.failure_reason || 'Falha informada pelo gateway',
        p_gateway_payload: body,
      })

      if (error) throw new Error(error.message)

      await syncSubscriptionStatusByExternalInvoiceId(provider || 'gateway', externalInvoiceId, 'failed')
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
      external_invoice_id = null,
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
        external_invoice_id,
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
      .select('id, subscription_id, status')
      .single()

    if (error) throw new Error(error.message)

    if (data?.subscription_id && (status === 'paid' || status === 'failed')) {
      await syncSubscriptionStatusBySubscriptionId(data.subscription_id, status)
    }

    return data
  },
}
