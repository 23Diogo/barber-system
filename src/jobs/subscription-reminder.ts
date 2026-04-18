import { supabaseAdmin } from '../config/supabase'
import {
  sendNotification,
  tplSubscriptionReminder,
  formatDateBR,
  formatCurrencyBR,
  getSettings,
} from '../services/notification.service'

function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime()
  return Math.round(diff / 86_400_000)
}

export async function runSubscriptionReminder(): Promise<void> {
  console.log('🔔 [job] subscription-reminder iniciado')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: shops, error } = await supabaseAdmin
    .from('barbershops')
    .select('id, name, owner_name, whatsapp, plan_id, plan_status, subscription_end, notification_settings, meta_phone_id, meta_access_token')
    .in('plan_status', ['active', 'trialing', 'past_due'])
    .not('whatsapp', 'is', null)
    .not('meta_phone_id', 'is', null)
    .not('subscription_end', 'is', null)

  if (error) { console.error('❌ subscription-reminder query error:', error.message); return }

  for (const shop of shops ?? []) {
    const settings = getSettings(shop)
    const reminderDays: number[] = settings.subscription_reminder_days ?? [5, 3, 1, 0]

    const subEnd = new Date(shop.subscription_end)
    subEnd.setHours(0, 0, 0, 0)
    const daysUntil = daysBetween(today, subEnd)

    if (!reminderDays.includes(daysUntil)) continue
    if (daysUntil < 0) continue // já venceu

    // Busca nome do plano
    let planName = 'BarberFlow'
    let amount = 'R$ 0,00'
    if (shop.plan_id) {
      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('name, price')
        .eq('id', shop.plan_id)
        .maybeSingle()
      if (plan) {
        planName = plan.name
        amount = formatCurrencyBR(Number(plan.price || 0))
      }
    }

    const message = tplSubscriptionReminder({
      ownerName: shop.owner_name || 'Proprietário',
      shopName:  shop.name,
      planName,
      amount,
      dueDate:   formatDateBR(subEnd),
      daysUntil,
    })

    await sendNotification({
      barbershopId:   shop.id,
      type:           'subscription_reminder',
      referenceId:    shop.id,
      referenceDate:  subEnd.toISOString().split('T')[0],
      recipientPhone: shop.whatsapp,
      phoneNumberId:  shop.meta_phone_id,
      accessToken:    shop.meta_access_token,
      message,
    })
  }

  console.log('✅ [job] subscription-reminder concluído')
}
