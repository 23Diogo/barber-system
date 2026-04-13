import cron from 'node-cron'
import { supabaseAdmin } from '../config/supabase'

export const startLicenseCheckJob = () => {
  cron.schedule('0 0 * * *', async () => {
    console.log('🔍 [JOB] Verificando licenças vencidas...')

    const { data: expired } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, email')
      .eq('is_active', true)
      .not('subscription_end', 'is', null)
      .lt('subscription_end', new Date().toISOString())
      .neq('plan_status', 'trial')

    if (!expired?.length) {
      console.log('✅ Nenhuma licença vencida.')
      return
    }

    for (const shop of expired) {
      await supabaseAdmin
        .from('barbershops')
        .update({ is_active: false, plan_status: 'suspended' })
        .eq('id', shop.id)

      console.log(`⛔ Suspensa: ${shop.name} (${shop.email})`)
    }

    console.log(`✅ [JOB] ${expired.length} barbearia(s) suspensa(s).`)
  })

  console.log('⚙️  Job: verificação de licenças (diário 00:00)')
}
