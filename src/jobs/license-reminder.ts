import { supabaseAdmin } from '../config/supabase'
import { whatsappService } from '../modules/whatsapp/whatsapp.service'

export async function runLicenseRenewalReminder(): Promise<{ sent: number; skipped: number }> {
  let sent    = 0
  let skipped = 0

  const today    = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Busca licenças ativas que vencem em exatamente 5 dias
  const reminderDate = new Date(today)
  reminderDate.setDate(reminderDate.getDate() + 5)
  const reminderDateStr = reminderDate.toISOString().split('T')[0]

  const { data: licenses, error } = await supabaseAdmin
    .from('barbershop_licenses')
    .select('id, barbershop_id, current_period_end, amount')
    .eq('status', 'active')
    .gte('current_period_end', `${reminderDateStr}T00:00:00.000Z`)
    .lt('current_period_end',  `${reminderDateStr}T23:59:59.999Z`)

  if (error) {
    console.error('❌ [license-reminder] Erro ao buscar licenças:', error.message)
    return { sent: 0, skipped: 0 }
  }

  if (!licenses?.length) {
    console.log('✅ [license-reminder] Nenhuma licença vencendo em 5 dias.')
    return { sent: 0, skipped: 0 }
  }

  for (const license of licenses) {
    // Deduplicação — não manda dois lembretes no mesmo dia
    const { data: alreadySent } = await supabaseAdmin
      .from('notification_logs')
      .select('id')
      .eq('barbershop_id', license.barbershop_id)
      .eq('type', 'license_renewal_reminder')
      .eq('reference_id', license.id)
      .eq('reference_date', todayStr)
      .maybeSingle()

    if (alreadySent) { skipped++; continue }

    // Busca dados da barbearia
    const { data: shop } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, email, whatsapp, meta_phone_id, meta_access_token')
      .eq('id', license.barbershop_id)
      .single()

    if (!shop?.whatsapp || !shop?.meta_phone_id || !shop?.meta_access_token) {
      skipped++; continue
    }

    // Gera link de pagamento
    let paymentUrl = 'https://bbarberflow.com.br/app/assinatura'
    try {
      const { createMercadoPagoPreference } = await import('../modules/mercadopago/mercadopago.service')
      const preference = await createMercadoPagoPreference({
        title:             'BarberFlow — Renovação Mensal',
        quantity:          1,
        unitPrice:         Number(license.amount) || 89.90,
        externalReference: `license_${shop.id}`,
        payerEmail:        shop.email,
        successUrl:        'https://bbarberflow.com.br/app/assinatura/sucesso',
        failureUrl:        'https://bbarberflow.com.br/app/assinatura/falha',
        pendingUrl:        'https://bbarberflow.com.br/app/assinatura/pendente',
      })
      paymentUrl = preference.init_point
    } catch (mpErr: any) {
      console.error(`❌ [license-reminder] Erro ao gerar link para ${shop.name}:`, mpErr.message)
    }

    const vencimento = new Date(license.current_period_end).toLocaleDateString('pt-BR')
    const phone      = String(shop.whatsapp).replace(/\D/g, '')

    const message = [
      `⚠️ *BarberFlow — Renovação em 5 dias*`,
      ``,
      `Olá! A assinatura da *${shop.name}* vence em *${vencimento}*.`,
      ``,
      `Para manter seu sistema ativo, renove agora:`,
      `👉 ${paymentUrl}`,
      ``,
      `Valor: *R$ ${Number(license.amount).toFixed(2).replace('.', ',')}*`,
      ``,
      `Após o vencimento, você terá *5 dias de carência* antes da suspensão.`,
      ``,
      `Dúvidas? Fale com nosso suporte.`,
    ].join('\n')

    try {
      await whatsappService.sendMessage(
        shop.meta_phone_id,
        shop.meta_access_token,
        phone,
        message
      )

      await supabaseAdmin.from('notification_logs').upsert(
        {
          barbershop_id:   shop.id,
          type:            'license_renewal_reminder',
          reference_id:    license.id,
          reference_date:  todayStr,
          recipient_phone: phone,
          status:          'sent',
        },
        {
          onConflict:      'barbershop_id,type,reference_id,reference_date,recipient_phone',
          ignoreDuplicates: true,
        }
      )

      sent++
      console.log(`  ✉️  Lembrete de renovação → ${shop.name} (vence ${vencimento})`)
    } catch (err: any) {
      console.error(`  ❌ [license-reminder] Falha → ${shop.name}:`, err?.message)

      await supabaseAdmin.from('notification_logs').upsert(
        {
          barbershop_id:   shop.id,
          type:            'license_renewal_reminder',
          reference_id:    license.id,
          reference_date:  todayStr,
          recipient_phone: phone,
          status:          'failed',
          error_message:   err?.message ?? 'Erro desconhecido',
        },
        {
          onConflict:      'barbershop_id,type,reference_id,reference_date,recipient_phone',
          ignoreDuplicates: true,
        }
      )

      skipped++
    }
  }

  return { sent, skipped }
}
