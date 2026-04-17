import { mercadoPagoConfig } from '../../config/mercadopago';

type CreatePreferenceInput = {
  title: string;
  quantity: number;
  unitPrice: number;
  externalReference?: string;
  payerEmail?: string;
  successUrl?: string;
  failureUrl?: string;
  pendingUrl?: string;
  metadata?: Record<string, any>;
};

function buildFrontUrl(path: string) {
  const base = String(mercadoPagoConfig.frontendUrl || '').replace(/\/$/, '');
  const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export async function createMercadoPagoPreference({
  title,
  quantity,
  unitPrice,
  externalReference,
  payerEmail,
  successUrl,
  failureUrl,
  pendingUrl,
  metadata,
}: CreatePreferenceInput) {
  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mercadoPagoConfig.accessToken}`,
    },
    body: JSON.stringify({
      items: [
        {
          title,
          quantity,
          unit_price: unitPrice,
          currency_id: 'BRL',
        },
      ],
      external_reference: externalReference || undefined,
      payer: payerEmail ? { email: payerEmail } : undefined,
      metadata: metadata || undefined,
      back_urls: {
        success: successUrl || buildFrontUrl('/client/assinatura/'),
        failure: failureUrl || buildFrontUrl('/client/assinatura/'),
        pending: pendingUrl || buildFrontUrl('/client/assinatura/'),
      },
      auto_return: 'approved',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || 'Erro ao criar preferência no Mercado Pago');
  }

  return data;
}

export async function getMercadoPagoPayment(paymentId: string | number) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${mercadoPagoConfig.accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || 'Erro ao consultar pagamento no Mercado Pago');
  }

  return data;
}
