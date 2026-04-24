import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'
import { whatsappService } from '../modules/whatsapp/whatsapp.service'
import { getSettings } from '../services/notification.service'

// ─── Mensagem padrão (fallback se o dono não customizou) ──────────────────────

const DEFAULT_REACTIVATION_MSG =
  `👋 Olá, {nome}! Sentimos muito a sua falta 😊\n\n` +
  `Faz *{dias} dias* que você não passa aqui, e a gente ficou preocupado! 💈\n\n` +
  `Que tal dar uma renovada no visual essa semana?\n\n` +
  `🎁 Como presente de retorno, você ganha um *desconto especial* na próxima visita!\n\n` +
  `👉 Agende agora: {link}\n\n` +
  `_Te esperamos! Qualquer dúvida é só chamar._ 😄`

// ─── Substitui variáveis na mensagem ─────────────────────────────────────────
// Variáveis suportadas: {nome}, {dias}, {link}

function buildMessage(template: string, vars: {
  nome: string
  dias: number
  link: string
}): string {
  return template
    .replace(/\{nome\}/g, vars.nome)
    .replace(/\{dias\}/g, String(vars.dias))
    .replace(/\{link\}/g, vars.link)
}

// ─── Job ──────────────────────────────────────────────────────────────────────

export const startReactivationJob = () => {
  // Roda todo dia às 10:00
  cron.schedule('0 10 * * *', async () => {
    console.log('🔄 [JOB] Iniciando reativação de clientes inativos...')

    const { data: inactive, error } = await supabaseAdmin
      .from('vw_inactive_clients')
      .select('*')
      .gte('days_inactive', 30)
      .lte('days_inactive', 60)
      .limit(50)

    if (error) {
      console.error('❌ [reactivation] erro ao buscar clientes inativos:', error.message)
      return
    }

    let sent    = 0
    let skipped = 0

    for (const c of inactive ?? []) {
      if (!c.whatsapp) { skipped++; continue }

      // Busca dados e settings da barbearia
      const { data: shop } = await supabaseAdmin
        .from('barbershops')
        .select('id, name, slug, whatsapp, meta_phone_id, meta_access_token, is_active, notification_settings')
        .eq('id', c.barbershop_id)
        .single()

      if (!shop?.is_active || !shop?.meta_phone_id || !shop?.meta_access_token) {
        skipped++
        continue
      }

      // ── Verifica se o dono ativou a reativação ────────────────────────────
      const settings = getSettings(shop)
      if (settings.reactivation_enabled === false) { skipped++; continue }

      // ── Deduplicação: não reenvia para o mesmo cliente no mesmo dia ────────
      const today = new Date().toISOString().split('T')[0]

      const { data: alreadySent } = await supabaseAdmin
        .from('notification_logs')
        .select('id')
        .eq('barbershop_id', shop.id)
        .eq('type', 'reactivation')
        .eq('reference_id', String(c.client_id ?? c.id))
        .eq('reference_date', today)
        .maybeSingle()

      if (alreadySent) { skipped++; continue }

      // ── Monta a mensagem — usa customizada ou padrão ──────────────────────
      const template = String(settings.reactivation_message || '').trim() || DEFAULT_REACTIVATION_MSG
      const firstName = String(c.name || 'cliente').split(' ')[0]
      const link = `https://bbarberflow.com.br/client/cadastro/${shop.slug}`

      const message = buildMessage(template, {
        nome: firstName,
        dias: Number(c.days_inactive),
        link,
      })

      try {
        await whatsappService.sendMessage(
          shop.meta_phone_id,
          shop.meta_access_token,
          c.whatsapp,
          message,
        )

        await supabaseAdmin
          .from('notification_logs')
          .upsert(
            {
              barbershop_id:   shop.id,
              type:            'reactivation',
              reference_id:    String(c.client_id ?? c.id),
              reference_date:  today,
              recipient_phone: c.whatsapp,
              status:          'sent',
            },
            {
              onConflict:       'barbershop_id,type,reference_id,reference_date,recipient_phone',
              ignoreDuplicates: true,
            }
          )

        sent++
        console.log(`  ✉️  Reativação → ${c.name} (${c.whatsapp}) — ${c.days_inactive} dias inativo`)
      } catch (err: any) {
        console.error(`  ❌ Falha → ${c.name} (${c.whatsapp}):`, err?.message)

        await supabaseAdmin
          .from('notification_logs')
          .upsert(
            {
              barbershop_id:   shop.id,
              type:            'reactivation',
              reference_id:    String(c.client_id ?? c.id),
              reference_date:  today,
              recipient_phone: c.whatsapp,
              status:          'failed',
              error_message:   err?.message ?? 'Erro desconhecido',
            },
            {
              onConflict:       'barbershop_id,type,reference_id,reference_date,recipient_phone',
              ignoreDuplicates: true,
            }
          )
      }
    }

    console.log(`✅ [JOB] Reativação concluída — enviados: ${sent} | ignorados: ${skipped}`)
  })

  console.log('⚙️  Job: reativação de clientes (diário 10:00)')
}
