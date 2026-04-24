// CORRETO
import { supabaseAdmin }    from '../../config/supabase'
import { whatsappService }  from '../whatsapp/whatsapp.service'


export type NotificationType =
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'appointment_reminder_1h'
  | 'bills_reminder'
  | 'subscription_reminder'
  | 'stock_alert'
  | 'reactivation'
  | 'new_client'

interface SendOptions {
  barbershopId: string
  type: NotificationType
  referenceId: string
  referenceDate?: string
  recipientPhone: string
  phoneNumberId: string
  accessToken: string
  message: string
}

async function alreadySent(opts: {
  barbershopId: string
  type: string
  referenceId: string
  referenceDate?: string
  recipientPhone: string
}): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('notification_logs')
    .select('id')
    .eq('barbershop_id', opts.barbershopId)
    .eq('type', opts.type)
    .eq('reference_id', opts.referenceId)
    .eq('recipient_phone', opts.recipientPhone)
    .eq('reference_date', opts.referenceDate ?? null)
    .maybeSingle()
  return !!data
}

async function logNotification(opts: {
  barbershopId: string
  type: string
  referenceId: string
  referenceDate?: string
  recipientPhone: string
  status: 'sent' | 'failed'
  errorMessage?: string
}) {
  await supabaseAdmin
    .from('notification_logs')
    .upsert(
      {
        barbershop_id:   opts.barbershopId,
        type:            opts.type,
        reference_id:    opts.referenceId,
        reference_date:  opts.referenceDate ?? null,
        recipient_phone: opts.recipientPhone,
        status:          opts.status,
        error_message:   opts.errorMessage ?? null,
      },
      {
        onConflict:       'barbershop_id,type,reference_id,reference_date,recipient_phone',
        ignoreDuplicates: true,
      }
    )
}

export async function sendNotification(opts: SendOptions): Promise<void> {
  const already = await alreadySent({
    barbershopId:   opts.barbershopId,
    type:           opts.type,
    referenceId:    opts.referenceId,
    referenceDate:  opts.referenceDate,
    recipientPhone: opts.recipientPhone,
  })
  if (already) return

  try {
    await whatsappService.sendMessage(
      opts.phoneNumberId,
      opts.accessToken,
      opts.recipientPhone,
      opts.message,
    )
    await logNotification({ ...opts, status: 'sent' })
  } catch (err: any) {
    await logNotification({ ...opts, status: 'failed', errorMessage: err?.message })
    console.error(`❌ Notificação falhou [${opts.type}] ref=${opts.referenceId}:`, err?.message)
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function tplAppointmentConfirmed(p: {
  clientName: string; shopName: string; serviceName: string
  barberName: string; date: string; time: string; slug: string
}): string {
  return `✅ *Agendamento confirmado!*\n\nOlá, ${p.clientName}! Seu agendamento na *${p.shopName}* foi confirmado.\n\n📋 *Serviço:* ${p.serviceName}\n💈 *Profissional:* ${p.barberName}\n📅 *Data:* ${p.date}\n🕐 *Horário:* ${p.time}\n\nPara cancelar ou reagendar acesse: https://bbarberflow.com.br/client/${p.slug}`
}

export function tplAppointmentConfirmedBarber(p: {
  barberName: string; clientName: string; serviceName: string; date: string; time: string
}): string {
  return `💈 *Novo agendamento!*\n\nOlá, ${p.barberName}! Você tem um novo agendamento.\n\n👤 *Cliente:* ${p.clientName}\n📋 *Serviço:* ${p.serviceName}\n📅 *Data:* ${p.date}\n🕐 *Horário:* ${p.time}`
}

export function tplAppointmentCancelled(p: {
  clientName: string; shopName: string; serviceName: string; date: string; time: string
}): string {
  return `❌ *Agendamento cancelado*\n\nOlá, ${p.clientName}. Seu agendamento na *${p.shopName}* foi cancelado.\n\n📋 *Serviço:* ${p.serviceName}\n📅 *Data:* ${p.date}\n🕐 *Horário:* ${p.time}\n\nPara reagendar, entre em contato conosco! 😊`
}

export function tplAppointmentReminder1h(p: {
  clientName: string; shopName: string; serviceName: string
  barberName: string; time: string; address: string
}): string {
  return `⏰ *Lembrete de agendamento*\n\nOlá, ${p.clientName}! Daqui a 1 hora você tem um horário na *${p.shopName}*.\n\n💈 *Profissional:* ${p.barberName}\n📋 *Serviço:* ${p.serviceName}\n🕐 *Horário:* ${p.time}\n📍 *Endereço:* ${p.address}\n\nTe esperamos! 💇‍♂️`
}

export function tplBillsReminder(p: {
  ownerName: string; shopName: string; description: string
  amount: string; dueDate: string; daysUntil: number
}): string {
  const urgency = p.daysUntil === 0
    ? '🚨 *VENCE HOJE!*'
    : p.daysUntil === 1
      ? '⚠️ *Vence amanhã!*'
      : `📅 Vence em *${p.daysUntil} dias*`
  return `💳 *Lembrete de conta a pagar*\n\nOlá, ${p.ownerName}! ${urgency}\n\n🏪 *Barbearia:* ${p.shopName}\n📋 *Descrição:* ${p.description}\n💰 *Valor:* ${p.amount}\n📅 *Vencimento:* ${p.dueDate}\n\nAcesse o painel para registrar o pagamento.`
}

export function tplSubscriptionReminder(p: {
  ownerName: string; shopName: string; planName: string
  amount: string; dueDate: string; daysUntil: number
}): string {
  const urgency = p.daysUntil === 0
    ? '🚨 *SUA MENSALIDADE VENCE HOJE!*'
    : p.daysUntil === 1
      ? '⚠️ *Sua mensalidade vence amanhã!*'
      : `📅 Sua mensalidade vence em *${p.daysUntil} dias*`
  return `🔔 *BarberFlow — Aviso de vencimento*\n\nOlá, ${p.ownerName}! ${urgency}\n\n🏪 *Barbearia:* ${p.shopName}\n📦 *Plano:* ${p.planName}\n💰 *Valor:* ${p.amount}\n📅 *Vencimento:* ${p.dueDate}\n\nPara manter seu sistema ativo, efetue o pagamento pelo link:\n👉 https://bbarberflow.com.br/planos`
}

export function tplStockAlert(p: {
  ownerName: string; shopName: string
  items: Array<{ name: string; current: number; min: number; unit: string }>
}): string {
  const list = p.items.map(i => `  • ${i.name}: ${i.current} ${i.unit} (mín: ${i.min} ${i.unit})`).join('\n')
  return `📦 *Alerta de estoque baixo — ${p.shopName}*\n\nOlá, ${p.ownerName}! Os itens abaixo estão abaixo do estoque mínimo:\n\n${list}\n\nAcesse o painel de estoque para reabastecer.`
}

export function tplNewClient(p: {
  ownerName: string; shopName: string; clientName: string; clientPhone: string
}): string {
  return `🎉 *Novo cliente cadastrado!*\n\nOlá, ${p.ownerName}! Um novo cliente acabou de se cadastrar na *${p.shopName}*.\n\n👤 *Nome:* ${p.clientName}\n📱 *Telefone:* ${p.clientPhone}\n\nAcesse o painel de clientes para ver o perfil completo.`
}

export function formatDateBR(value: string | Date): string {
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function formatTimeBR(value: string | Date): string {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

export function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

// ─── getSettings — defaults completos por notificação ────────────────────────

export function getSettings(shop: any) {
  const defaults = {
    // Agendamentos (disparo imediato — sem hora configurável)
    appointment_confirmed:         true,
    appointment_cancelled:         true,
    appointment_reminder_1h:       true,

    // Contas a pagar
    bills_reminder_enabled:        true,
    bills_reminder_days:           [5, 3, 1, 0],
    bills_reminder_hour:           9,

    // Mensalidade do sistema
    subscription_reminder_enabled: true,
    subscription_reminder_days:    [5, 3, 1, 0],
    subscription_reminder_hour:    9,

    // Estoque baixo
    stock_alert_enabled:           true,
    stock_alert_hour:              8,

    // Reativação de clientes inativos
    reactivation_enabled:          true,
    reactivation_hour:             10,
    reactivation_message:          '',

    // Novo cliente cadastrado via portal
    new_client_alert:              true,
  }
  return { ...defaults, ...(shop.notification_settings || {}) }
}
