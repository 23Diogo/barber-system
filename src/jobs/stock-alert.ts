import { supabaseAdmin } from '../config/supabase'
import {
  sendNotification,
  tplStockAlert,
  getSettings,
} from '../services/notification.service'

export async function runStockAlert(): Promise<void> {
  console.log('📦 [job] stock-alert iniciado')

  const { data: shops } = await supabaseAdmin
    .from('barbershops')
    .select('id, name, owner_name, whatsapp, notification_settings, meta_phone_id, meta_access_token')
    .eq('is_active', true)
    .not('whatsapp', 'is', null)
    .not('meta_phone_id', 'is', null)

  const today = new Date().toISOString().split('T')[0]

  for (const shop of shops ?? []) {
    const settings = getSettings(shop)
    if (!settings.stock_alert) continue

    const { data: lowItems } = await supabaseAdmin
      .from('stock_items')
      .select('id, name, current_stock, min_stock, unit')
      .eq('barbershop_id', shop.id)
      .eq('is_active', true)
      .filter('current_stock', 'lt', supabaseAdmin.rpc('get_min_stock', {}) as any)

    // Fallback: busca via query direta comparando colunas
    const { data: lowStock } = await supabaseAdmin
      .from('stock_items')
      .select('id, name, current_stock, min_stock, unit')
      .eq('barbershop_id', shop.id)
      .eq('is_active', true)

    const critical = (lowStock ?? []).filter(
      (item) => Number(item.current_stock) < Number(item.min_stock)
    )

    if (!critical.length) continue

    const message = tplStockAlert({
      ownerName: shop.owner_name || 'Proprietário',
      shopName:  shop.name,
      items:     critical.map((i) => ({
        name:    i.name,
        current: Number(i.current_stock),
        min:     Number(i.min_stock),
        unit:    i.unit || 'un',
      })),
    })

    // referenceId único por dia para evitar spam diário duplicado
    const referenceId = `stock-${shop.id}-${today}`

    await sendNotification({
      barbershopId:   shop.id,
      type:           'stock_alert',
      referenceId,
      referenceDate:  today,
      recipientPhone: shop.whatsapp,
      phoneNumberId:  shop.meta_phone_id,
      accessToken:    shop.meta_access_token,
      message,
    })
  }

  console.log('✅ [job] stock-alert concluído')
}
