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

// ─── Ativa ou renova licença da plataforma ────────────────────────────────────
async function handlePlatformLicensePayment(
  barbershopId: string,
  payment: any
) {
  const now = new Date()

  // Busca licença atual
  const { data: license } = await supabaseAdmin
    .from('barbershop_licenses')
    .select('id, status, current_period_end')
    .eq('barbershop_id', barbershopId)
    .single()

  // Calcula novo período:
  // Se já tem período vigente e ainda não venceu, renova a partir do fim do período atual
  // Caso contrário, começa do zero (hoje)
  let periodStart = now
  let periodEnd = new Date(now)
  periodEnd.setDate(periodEnd.getDate() + 30)

  if (license?.current_period_end) {
    const currentEnd = new Date(license.current_period_end)
    if (currentEnd > now) {
      periodStart = currentEnd
      periodEnd = new Date(currentEnd)
      periodEnd.setDate(periodEnd.getDate() + 30)
    }
  }

  if (license) {
    // Atualiza licença existente
    const { error } = await supabaseAdmin
      .from('barbershop_licenses')
      .update({
        status: 'active',
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        suspended_at: null,
        mp_subscription_id: String(payment.id),
        updated_at: now.toISOString(),
      })
      .eq('barbershop_id', barbershopId)

    if (error) throw new Error(`Erro ao atualizar licença: ${error.message}`)
  } else {
    // Cria nova licença
    const { error } = await supabaseAdmin
      .from('barbershop_licenses')
      .insert({
        barbershop_id: barbershopId,
        status: 'active',
        amount: 89.90,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        mp_subscription_id: String(payment.id),
        grace_days: 5,
      })

    if (error) throw new Error(`Erro ao criar licença: ${error.message}`)
  }

  // Notifica o dono via WhatsApp
  try {
    const { data: shop } = await supabaseAdmin
      .from('barbershops')
      .select('name, whatsapp, meta_phone_id, meta_access_token')
      .eq('id', barbershopId)
      .single()

    if (shop?.whatsapp && shop?.meta_phone_id && shop?.meta_access_token) {
      const { whatsappService } = await import('../whatsapp/whatsapp.service')
      const phone = String(shop.whatsapp).replace(/\D/g, '')
      const vencimento = periodEnd.toLocaleDateString('pt-BR')

      await whatsappService.sendMessage(
        shop.meta_phone_id,
        shop.meta_access_token,
        phone,
        `✅ *BarberFlow — Assinatura Ativa!*\n\nOlá! O pagamento da *${shop.name}* foi confirmado.\n\n📅 Próximo vencimento: *${vencimento}*\n\nSeu sistema está ativo. Bons atendimentos! 💈`
      )
    }
  } catch (waErr: any) {
    console.error('❌ [Webhook] Erro ao notificar WhatsApp após pagamento:', waErr.message)
  }

  console.log(`✅ [Webhook] Licença ativada/renovada: barbershop_id=${barbershopId} até ${periodEnd.toISOString()}`)
}

// ─── Controller principal ─────────────────────────────────────────────────────
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

    // ─── Pagamento de licença da plataforma ───────────────────────────────────
    // external_reference no formato: license_BARBERSHOP_ID
    if (externalReference.startsWith('license_')) {
      const barbershopId = externalReference.replace('license_', '')

      if (localStatus === 'paid') {
        await handlePlatformLicensePayment(barbershopId, payment)
      } else {
        console.log(`ℹ️ [Webhook] Licença ${barbershopId} — status: ${localStatus}. Aguardando pagamento.`)
      }

      return res.sendStatus(200)
    }

    // ─── Pagamento de plano de corte (fluxo existente) ────────────────────────
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
