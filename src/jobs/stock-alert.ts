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

    // ── Filtro por hora configurada da barbearia ──────────────────────────────
    const shopHour = Number(settings.daily_jobs_hour ?? 18)
    if (shopHour !== currentHour) continue

    // ── Filtro por setting de alerta de estoque ───────────────────────────────
    if (!settings.stock_alert) continue

    // Busca itens ativos desta barbearia em uma única query
    const { data: stockItems, error: stockError } = await supabaseAdmin
      .from('stock_items')
      .select('id, name, current_stock, min_stock, unit')
      .eq('barbershop_id', shop.id)
      .eq('is_active', true)

    if (stockError) {
      console.error(`❌ [stock-alert] erro ao buscar estoque da barbearia ${shop.id}:`, stockError.message)
      continue
    }

    // Filtra em memória os itens abaixo do mínimo
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

    // referenceId único por dia para evitar spam duplicado
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
