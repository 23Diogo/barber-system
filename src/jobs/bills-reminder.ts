import { supabaseAdmin } from '../config/supabase'
import {
  sendNotification,
  tplBillsReminder,
  formatDateBR,
  formatCurrencyBR,
  getSettings,
} from '../services/notification.service'

function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime()
  return Math.round(diff / 86_400_000)
}

export async function runBillsReminder(currentHour: number): Promise<void> {
  console.log('💳 [job] bills-reminder iniciado')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Busca apenas barbearias ativas com WhatsApp e Meta configurados
  const { data: shops, error } = await supabaseAdmin
    .from('barbershops')
    .select('id, name, owner_name, whatsapp, notification_settings, meta_phone_id, meta_access_token')
    .eq('is_active', true)
    .not('whatsapp', 'is', null)
    .not('meta_phone_id', 'is', null)

  if (error) {
    console.error('❌ [bills-reminder] erro ao buscar barbearias:', error.message)
    return
  }

  for (const shop of shops ?? []) {
    const settings = getSettings(shop)

    // ── Filtro por hora configurada da barbearia ──────────────────────────────
    const shopHour = Number(settings.daily_jobs_hour ?? 18)
    if (shopHour !== currentHour) continue

    const reminderDays: number[] = settings.bills_reminder_days ?? [5, 3, 1, 0]

    // Busca contas a pagar pendentes desta barbearia
    const { data: bills, error: billsError } = await supabaseAdmin
      .from('bills')
      .select('id, description, amount, due_date')
      .eq('barbershop_id', shop.id)
      .eq('status', 'pending')
      .is('paid_at', null)

    if (billsError) {
      console.error(`❌ [bills-reminder] erro ao buscar bills da barbearia ${shop.id}:`, billsError.message)
      continue
    }

    for (const bill of bills ?? []) {
      const dueDate = new Date(bill.due_date)
      dueDate.setHours(0, 0, 0, 0)

      const daysUntil = daysBetween(today, dueDate)

      // Ignora se já venceu ou se o dia não está na lista de lembretes
      if (daysUntil < 0) continue
      if (!reminderDays.includes(daysUntil)) continue

      const message = tplBillsReminder({
        ownerName:   shop.owner_name || 'Proprietário',
        shopName:    shop.name,
        description: bill.description,
        amount:      formatCurrencyBR(Number(bill.amount)),
        dueDate:     formatDateBR(bill.due_date),
        daysUntil,
      })

      await sendNotification({
        barbershopId:   shop.id,
        type:           'bills_reminder',
        referenceId:    bill.id,
        referenceDate:  bill.due_date,
        recipientPhone: shop.whatsapp,
        phoneNumberId:  shop.meta_phone_id,
        accessToken:    shop.meta_access_token,
        message,
      })
    }
  }

  console.log('✅ [job] bills-reminder concluído')
}
