import crypto from 'crypto';
import { Request, Response } from 'express';
import { mercadoPagoConfig } from '../../config/mercadopago';
import { getMercadoPagoPayment } from './mercadopago.service';

function parseSignatureHeader(signatureHeader: string) {
  const parts = String(signatureHeader || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const values: Record<string, string> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) values[key.trim()] = value.trim();
  }

  return {
    ts: values.ts || '',
    v1: values.v1 || '',
  };
}

function validateMercadoPagoSignature({
  secret,
  signatureHeader,
  requestId,
  dataId,
}: {
  secret: string;
  signatureHeader: string;
  requestId: string;
  dataId: string;
}) {
  if (!secret) return true;

  const { ts, v1 } = parseSignatureHeader(signatureHeader);

  if (!ts || !v1 || !requestId || !dataId) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const expected = Buffer.from(hash, 'utf8');
  const received = Buffer.from(v1, 'utf8');

  if (expected.length !== received.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

function mapMercadoPagoStatusToInvoiceStatus(status: string) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'approved') return 'paid';
  if (normalized === 'pending' || normalized === 'in_process' || normalized === 'authorized') return 'pending';
  if (normalized === 'cancelled' || normalized === 'cancelled_by_user') return 'canceled';
  if (normalized === 'rejected' || normalized === 'refunded' || normalized === 'charged_back') return 'failed';

  return 'pending';
}

export async function mercadoPagoWebhookController(req: Request, res: Response) {
  try {
    const dataId =
      String(req.query['data.id'] || req.body?.data?.id || '').trim();

    const type =
      String(req.query.type || req.query.topic || req.body?.type || '').trim();

    const signatureHeader = String(req.headers['x-signature'] || '');
    const requestId = String(req.headers['x-request-id'] || '');

    const isValid = validateMercadoPagoSignature({
      secret: mercadoPagoConfig.webhookSecret,
      signatureHeader,
      requestId,
      dataId,
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Assinatura do webhook inválida.' });
    }

    if (type !== 'payment' || !dataId) {
      return res.sendStatus(200);
    }

    const payment = await getMercadoPagoPayment(dataId);
    const localStatus = mapMercadoPagoStatusToInvoiceStatus(payment.status);

    console.log('✅ Webhook Mercado Pago validado');
    console.log({
      notificationType: type,
      paymentId: payment.id,
      externalReference: payment.external_reference,
      mercadoPagoStatus: payment.status,
      localStatus,
      transactionAmount: payment.transaction_amount,
      payerEmail: payment.payer?.email,
    });

    /**
     * PRÓXIMO PASSO DA PERSISTÊNCIA:
     * Aqui você vai localizar sua cobrança local usando:
     *   payment.external_reference
     * e atualizar o status no banco.
     *
     * Exemplo do que deve existir no seu módulo de payments:
     *   await syncInvoiceByGatewayReference(payment.external_reference, {
     *     gateway_status: payment.status,
     *     local_status: localStatus,
     *     payment_id: String(payment.id),
     *     paid_at: payment.date_approved || null,
     *   });
     */

    return res.sendStatus(200);
  } catch (error) {
    console.error('❌ Erro ao processar webhook Mercado Pago:', error);
    return res.sendStatus(500);
  }
}
