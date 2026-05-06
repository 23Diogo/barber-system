import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'

export const startLicenseCheckJob = () => {
  // Roda todo dia à meia-noite
  cron.schedule('0 0 * * *', async () => {
    console.log('🔍 [JOB] Verificando licenças da plataforma...')

    const now = new Date()

    // Busca licenças ativas cujo período encerrou há mais de 5 dias (carência)
    const graceDeadline = new Date(now)
    graceDeadline.setDate(graceDeadline.getDate() - 5)

    const { data: expired, error } = await supabaseAdmin
      .from('barbershop_licenses')
      .select('id, barbershop_id, current_period_end')
      .eq('status', 'active')
      .not('current_period_end', 'is', null)
      .lt('current_period_end', graceDeadline.toISOString())

    if (error) {
      console.error('❌ [JOB] Erro ao buscar licenças:', error.message)
      return
    }

    if (!expired?.length) {
      console.log('✅ [JOB] Nenhuma licença vencida.')
      return
    }

    for (const license of expired) {
      // Suspende a licença
      await supabaseAdmin
        .from('barbershop_licenses')
        .update({
          status: 'suspended',
          suspended_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', license.id)

      // Busca dados da barbearia para o log e WhatsApp
      const { data: shop } = await supabaseAdmin
        .from('barbershops')
        .select('id, name, whatsapp, meta_phone_id, meta_access_token')
        .eq('id', license.barbershop_id)
        .single()

      if (shop) {
        console.log(`⛔ [JOB] Licença suspensa: ${shop.name}`)

        // Notifica o dono via WhatsApp se tiver número configurado
        if (shop.whatsapp && shop.meta_phone_id && shop.meta_access_token) {
          try {
            const { whatsappService } = await import('../modules/whatsapp/whatsapp.service')
            const phone = String(shop.whatsapp).replace(/\D/g, '')
            await whatsappService.sendMessage(
              shop.meta_phone_id,
              shop.meta_access_token,
              phone,
              `⚠️ *BarberFlow — Assinatura Suspensa*\n\nOlá! A assinatura da *${shop.name}* foi suspensa por falta de pagamento.\n\nSeu sistema e o agendamento dos clientes estão bloqueados.\n\n👉 Regularize agora para reativar:\nhttps://bbarberflow.com.br/assinatura\n\nDúvidas? Fale conosco pelo suporte.`
            )
          } catch (waErr: any) {
            console.error(`❌ [JOB] Erro ao notificar ${shop.name} via WhatsApp:`, waErr.message)
          }
        }
      }
    }

    console.log(`✅ [JOB] ${expired.length} licença(s) suspensa(s).`)
  })

  console.log('⚙️  Job: verificação de licenças da plataforma (diário 00:00)')
}
