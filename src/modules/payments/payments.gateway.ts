export type GatewayProvider = 'asaas' | 'mercadopago' | 'stripe' | 'gateway'

export interface CreateHostedCheckoutInput {
  provider: GatewayProvider
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  customerDocument?: string | null
  description: string
  amountCents: number
  dueAt?: string | null
  externalReference?: string | null
}

export interface CreateHostedCheckoutOutput {
  provider: GatewayProvider
  externalCustomerId?: string | null
  externalSubscriptionId?: string | null
  externalInvoiceId?: string | null
  externalChargeId?: string | null
  externalCheckoutId?: string | null
  paymentUrl?: string | null
  raw: any
}

export interface ParsedWebhookOutput {
  provider: GatewayProvider
  eventType: string
  externalEventId: string | null
  externalObjectId: string | null
  externalInvoiceId: string | null
  paymentUrl?: string | null
  failureReason?: string | null
  raw: any
}

function normalizeProvider(provider: string): GatewayProvider {
  const value = String(provider || '').toLowerCase()

  if (value === 'asaas') return 'asaas'
  if (value === 'mercadopago') return 'mercadopago'
  if (value === 'stripe') return 'stripe'

  return 'gateway'
}

async function createHostedCheckoutAsaas(
  _input: CreateHostedCheckoutInput
): Promise<CreateHostedCheckoutOutput> {
  throw new Error('Integração Asaas ainda não implementada em payments.gateway.ts')
}

async function createHostedCheckoutMercadoPago(
  _input: CreateHostedCheckoutInput
): Promise<CreateHostedCheckoutOutput> {
  throw new Error('Integração Mercado Pago ainda não implementada em payments.gateway.ts')
}

async function createHostedCheckoutStripe(
  _input: CreateHostedCheckoutInput
): Promise<CreateHostedCheckoutOutput> {
  throw new Error('Integração Stripe ainda não implementada em payments.gateway.ts')
}

function parseAsaasWebhook(payload: any): ParsedWebhookOutput {
  return {
    provider: 'asaas',
    eventType: payload.event || 'unknown',
    externalEventId: payload.id || null,
    externalObjectId: payload.payment?.id || null,
    externalInvoiceId: payload.payment?.id || payload.invoice_id || null,
    paymentUrl: payload.payment?.invoiceUrl || payload.payment?.bankSlipUrl || null,
    failureReason: payload.payment?.refusalReason || null,
    raw: payload,
  }
}

function parseMercadoPagoWebhook(payload: any): ParsedWebhookOutput {
  return {
    provider: 'mercadopago',
    eventType: payload.type || payload.action || 'unknown',
    externalEventId: payload.id?.toString?.() || null,
    externalObjectId: payload.data?.id?.toString?.() || null,
    externalInvoiceId: payload.data?.id?.toString?.() || null,
    paymentUrl: null,
    failureReason: null,
    raw: payload,
  }
}

function parseStripeWebhook(payload: any): ParsedWebhookOutput {
  return {
    provider: 'stripe',
    eventType: payload.type || 'unknown',
    externalEventId: payload.id || null,
    externalObjectId: payload.data?.object?.id || null,
    externalInvoiceId: payload.data?.object?.invoice || payload.data?.object?.id || null,
    paymentUrl: null,
    failureReason: payload.data?.object?.last_payment_error?.message || null,
    raw: payload,
  }
}

function parseGenericWebhook(payload: any): ParsedWebhookOutput {
  return {
    provider: 'gateway',
    eventType: payload.event || payload.type || 'unknown',
    externalEventId: payload.id || null,
    externalObjectId: payload.payment?.id || payload.data?.id || null,
    externalInvoiceId:
      payload.invoice_id ||
      payload.payment?.invoice_id ||
      payload.data?.invoice_id ||
      null,
    paymentUrl: payload.payment_url || null,
    failureReason: payload.failure_reason || null,
    raw: payload,
  }
}

export const paymentsGateway = {
  async createHostedCheckout(
    input: CreateHostedCheckoutInput
  ): Promise<CreateHostedCheckoutOutput> {
    const provider = normalizeProvider(input.provider)

    if (provider === 'asaas') {
      return createHostedCheckoutAsaas({ ...input, provider })
    }

    if (provider === 'mercadopago') {
      return createHostedCheckoutMercadoPago({ ...input, provider })
    }

    if (provider === 'stripe') {
      return createHostedCheckoutStripe({ ...input, provider })
    }

    throw new Error(`Gateway "${provider}" ainda não implementado`)
  },

  parseWebhook(provider: string, payload: any): ParsedWebhookOutput {
    const normalized = normalizeProvider(provider)

    if (normalized === 'asaas') return parseAsaasWebhook(payload)
    if (normalized === 'mercadopago') return parseMercadoPagoWebhook(payload)
    if (normalized === 'stripe') return parseStripeWebhook(payload)

    return parseGenericWebhook(payload)
  },
}
