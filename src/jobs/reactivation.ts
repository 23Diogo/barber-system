import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'
import { whatsappService } from '../modules/whatsapp/whatsapp.service'

export const startReactivationJob = () => {
  cron.schedule('0 10 * * *', async () => {
    console.log('🔄 [JOB] Clientes inativos...')

    const { data: inactive } = await supabaseAdmin
      .from('vw_inactive_clients')
      .select('*')
      .gte('days_inactive', 30)
      .lte('days_inactive', 60)
      .limit(50)

    for (const c of inactive ?? []) {
      const { data: shop } = await supabaseAdmin
        .from('barbershops')
        .select('meta_phone_id, meta_access_token, is_active, slug')
        .eq('id', c.barbershop_id)
        .single()

      if (!shop?.is_active || !c.whatsapp) continue

      const link = `https://barberflow.app/${shop.slug}`
      const msg  = `👋 Sentimos sua falta, ${c.name}! Faz ${c.days_inactive} dias que não te vemos.\nQue tal agendar? ${link} 💈`

      await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, c.whatsapp, msg)
    }

    console.log(`✅ [JOB] ${inactive?.length ?? 0} mensagens de reativação enviadas.`)
  })

  console.log('⚙️  Job: reativação de clientes (diário 10:00)')
}
