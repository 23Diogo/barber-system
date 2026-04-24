import { supabaseAdmin } from '../config/supabase'
import {
  sendNotification,
  tplStockAlert,
  getSettings,
} from '../services/notification.service'

export async function runStockAlert(currentHour: number): Promise<void> {
  console.log('📦 [job] stock-alert iniciado')

  const today = new Date().toISOString().split('T')[0]

  const { data: shops, error } = await supabaseAdmin
    .from('barbershops')
    .select('id, name, owner_name, whatsapp, notification_settings, meta_phone_id, meta_access_token')
    .eq('is_active', true)
    .not('whatsapp', 'is', null)
    .not('meta_phone_id', 'is', null)

  if (error) {
    console.error('❌ [stock-alert] erro ao buscar barbearias:', error.message)
    return
  }

  for (const shop of shops ?? []) {
    const settings = getSettings(shop)

    // Filtro: notificação habilitada
    if (!settings.stock_alert_enabled) continue

    // Filtro: hora configurada desta notificação para esta barbearia
    if (Number(settings.stock_alert_hour ?? 8) !== currentHour) continue

    const { data: stockItems, error: stockError } = await supabaseAdmin
      .from('stock_items')
      .select('id, name, current_stock, min_stock, unit')
      .eq('barbershop_id', shop.id)
      .eq('is_active', true)

    if (stockError) {
      console.error(`❌ [stock-alert] barbearia ${shop.id}:`, stockError.message)
      continue
    }

    const critical = (stockItems ?? []).filter(
      (item) => Number(item.current_stock) < Number(item.min_stock)
    )

    if (!critical.length) continue

    const message = tplStockAlert({
      ownerName: shop.owner_name || 'Proprietário',
      shopName:  shop.name,
      items: critical.map((i) => ({
        name:    i.name,
        current: Number(i.current_stock),
        min:     Number(i.min_stock),
        unit:    i.unit || 'un',
      })),
    })

    await sendNotification({
      barbershopId:   shop.id,
      type:           'stock_alert',
      referenceId:    `stock-${shop.id}-${today}`,
      referenceDate:  today,
      recipientPhone: shop.whatsapp,
      phoneNumberId:  shop.meta_phone_id,
      accessToken:    shop.meta_access_token,
      message,
    })
  }

  console.log('✅ [job] stock-alert concluído')
}
