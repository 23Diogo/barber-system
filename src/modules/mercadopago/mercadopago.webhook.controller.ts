import crypto from 'crypto';
import { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
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
  if (['pending', 'in_process', 'authorized'].includes(normalized)) return 'pending';
  if (['cancelled', 'cancelled_by_user'].includes(normalized)) return 'canceled';
  if (['rejected', 'refunded', 'charged_back'].includes(normalized)) return 'failed';

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
    const externalReference = String(payment.external_reference || '').trim();

    if (!externalReference) {
      console.warn('Webhook Mercado Pago sem external_reference. Ignorando.');
      return res.sendStatus(200);
    }

    if (localStatus === 'paid') {
      const { error } = await supabaseAdmin.rpc('mark_subscription_invoice_paid', {
        p_provider: 'mercado_pago',
        p_external_invoice_id: externalReference,
        p_paid_at: payment.date_approved || new Date().toISOString(),
        p_payment_url: null,
        p_gateway_payload: payment,
      });

      if (error) throw new Error(error.message);

      const { error: updateChargeError } = await supabaseAdmin
        .from('subscription_invoices')
        .update({
          external_charge_id: String(payment.id),
          gateway_payload: payment,
        })
        .eq('external_invoice_id', externalReference)
        .eq('gateway_provider', 'mercado_pago');

      if (updateChargeError) throw new Error(updateChargeError.message);
    } else if (localStatus === 'failed' || localStatus === 'canceled') {
      const { error } = await supabaseAdmin.rpc('mark_subscription_invoice_failed', {
        p_provider: 'mercado_pago',
        p_external_invoice_id: externalReference,
        p_failure_reason: payment.status_detail || payment.status || 'payment_failed',
        p_gateway_payload: payment,
      });

      if (error) throw new Error(error.message);

      const { error: updateChargeError } = await supabaseAdmin
        .from('subscription_invoices')
        .update({
          external_charge_id: String(payment.id),
          gateway_payload: payment,
        })
        .eq('external_invoice_id', externalReference)
        .eq('gateway_provider', 'mercado_pago');

      if (updateChargeError) throw new Error(updateChargeError.message);
    } else {
      const { error } = await supabaseAdmin
        .from('subscription_invoices')
        .update({
          status: 'pending',
          external_charge_id: String(payment.id),
          gateway_payload: payment,
        })
        .eq('external_invoice_id', externalReference)
        .eq('gateway_provider', 'mercado_pago');

      if (error) throw new Error(error.message);
    }

    console.log('✅ Webhook Mercado Pago processado');
    console.log({
      notificationType: type,
      paymentId: payment.id,
      externalReference,
      mercadoPagoStatus: payment.status,
      localStatus,
      transactionAmount: payment.transaction_amount,
      payerEmail: payment.payer?.email,
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error('❌ Erro ao processar webhook Mercado Pago:', error);
    return res.sendStatus(500);
  }
}
