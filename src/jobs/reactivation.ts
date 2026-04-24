import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'
import { whatsappService } from '../modules/whatsapp/whatsapp.service'
import { getSettings } from '../services/notification.service'

const DEFAULT_REACTIVATION_MSG =
  `👋 Olá, {nome}! Sentimos muito a sua falta 😊\n\n` +
  `Faz *{dias} dias* que você não passa aqui, e a gente ficou preocupado! 💈\n\n` +
  `Que tal dar uma renovada no visual essa semana?\n\n` +
  `🎁 Como presente de retorno, você ganha um *desconto especial* na próxima visita!\n\n` +
  `👉 Agende agora: {link}\n\n` +
  `_Te esperamos! Qualquer dúvida é só chamar._ 😄`

function buildMessage(template: string, vars: { nome: string; dias: number; link: string }): string {
  return template
    .replace(/\{nome\}/g, vars.nome)
    .replace(/\{dias\}/g, String(vars.dias))
    .replace(/\{link\}/g, vars.link)
}

// ─── Função reutilizável (usada pelo cron e pelo endpoint de teste) ────────────

export async function runReactivation(forceShopId?: string): Promise<{ sent: number; skipped: number }> {
  const { data: inactive, error } = await supabaseAdmin
    .from('vw_inactive_clients')
    .select('*')
    .gte('days_inactive', 30)
    .lte('days_inactive', 60)
    .limit(50)

  if (error) {
    console.error('❌ [reactivation] erro ao buscar clientes:', error.message)
    return { sent: 0, skipped: 0 }
  }

  let sent    = 0
  let skipped = 0
  const today = new Date().toISOString().split('T')[0]
  const currentHour = new Date().getHours()

  for (const c of inactive ?? []) {
    if (!c.whatsapp) { skipped++; continue }

    const { data: shop } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, slug, meta_phone_id, meta_access_token, is_active, notification_settings')
      .eq('id', c.barbershop_id)
      .single()

    if (!shop?.is_active || !shop?.meta_phone_id || !shop?.meta_access_token) {
      skipped++; continue
    }

    // Se chamado pelo cron (sem forceShopId), filtra por hora e por barbearia
    if (!forceShopId) {
      if (shop.id !== c.barbershop_id) { skipped++; continue }
      const settings = getSettings(shop)
      if (!settings.reactivation_enabled) { skipped++; continue }
      if (Number(settings.reactivation_hour ?? 10) !== currentHour) { skipped++; continue }
    } else {
      // Chamado pelo endpoint de teste — só roda para a barbearia do token
      if (shop.id !== forceShopId) { skipped++; continue }
    }

    const settings = getSettings(shop)

    // Deduplicação
    const { data: alreadySent } = await supabaseAdmin
      .from('notification_logs')
      .select('id')
      .eq('barbershop_id', shop.id)
      .eq('type', 'reactivation')
      .eq('reference_id', String(c.client_id ?? c.id))
      .eq('reference_date', today)
      .maybeSingle()

    if (alreadySent) { skipped++; continue }

    const template  = String(settings.reactivation_message || '').trim() || DEFAULT_REACTIVATION_MSG
    const firstName = String(c.name || 'cliente').split(' ')[0]
    const link      = `https://bbarberflow.com.br/client/cadastro/${shop.slug}`

    const message = buildMessage(template, {
      nome: firstName,
      dias: Number(c.days_inactive),
      link,
    })

    try {
      await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, c.whatsapp, message)

      await supabaseAdmin.from('notification_logs').upsert(
        {
          barbershop_id:   shop.id,
          type:            'reactivation',
          reference_id:    String(c.client_id ?? c.id),
          reference_date:  today,
          recipient_phone: c.whatsapp,
          status:          'sent',
        },
        { onConflict: 'barbershop_id,type,reference_id,reference_date,recipient_phone', ignoreDuplicates: true }
      )

      sent++
      console.log(`  ✉️  Reativação → ${c.name} (${c.whatsapp}) — ${c.days_inactive} dias inativo`)
    } catch (err: any) {
      console.error(`  ❌ Falha → ${c.name}:`, err?.message)

      await supabaseAdmin.from('notification_logs').upsert(
        {
          barbershop_id:   shop.id,
          type:            'reactivation',
          reference_id:    String(c.client_id ?? c.id),
          reference_date:  today,
          recipient_phone: c.whatsapp,
          status:          'failed',
          error_message:   err?.message ?? 'Erro desconhecido',
        },
        { onConflict: 'barbershop_id,type,reference_id,reference_date,recipient_phone', ignoreDuplicates: true }
      )
    }
  }

  return { sent, skipped }
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

export const startReactivationJob = () => {
  cron.schedule('0 * * * *', async () => {
    console.log('🔄 [JOB] Reativação de clientes inativos...')
    const { sent, skipped } = await runReactivation()
    console.log(`✅ [JOB] Reativação — enviados: ${sent} | ignorados: ${skipped}`)
  })
  console.log('⚙️  Job: reativação de clientes (hora individual por barbearia)')
}
