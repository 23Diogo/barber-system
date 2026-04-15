import { mercadoPagoConfig } from '../../config/mercadopago';

type CreatePreferenceInput = {
  title: string;
  quantity: number;
  unitPrice: number;
};

export async function createMercadoPagoPreference({
  title,
  quantity,
  unitPrice,
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
      back_urls: {
        success: `${mercadoPagoConfig.frontendUrl}/success.html`,
        failure: `${mercadoPagoConfig.frontendUrl}/failure.html`,
        pending: `${mercadoPagoConfig.frontendUrl}/pending.html`,
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
