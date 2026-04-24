// src/modules/barbershops/test-notifications.routes.ts
// ⚠️  REMOVER ANTES DE IR PARA PRODUÇÃO — endpoints sem autenticação
//
// Registrar no app.ts:
//   import testNotifRoutes from './modules/barbershops/test-notifications.routes'
//   app.use('/api/test-notifications', testNotifRoutes)

import { Router, Request, Response } from 'express'
import { supabaseAdmin }    from '../../config/supabase'
import { authenticate }     from '../../middleware/auth'
import { whatsappService }  from '../whatsapp/whatsapp.service'
import { runBillsReminder }          from '../../jobs/bills-reminder'
import { runStockAlert }             from '../../jobs/stock-alert'
import { runSubscriptionReminder }   from '../../jobs/subscription-reminder'
import { runReactivation }           from '../../jobs/reactivation'
import {
  getSettings,
  tplBillsReminder,
  tplStockAlert,
  tplSubscriptionReminder,
  tplAppointmentConfirmed,
  tplAppointmentReminder1h,
  tplNewClient,
  formatDateBR,
  formatCurrencyBR,
} from '../../services/notification.service'

const router = Router()

// Todas as rotas de teste exigem autenticação normal
// (assim você só testa para a SUA barbearia)
router.use(authenticate)

// ─── Helper: busca dados da barbearia do usuário logado ──────────────────────

async function getShop(barbershopId: string) {
  const { data, error } = await supabaseAdmin
    .from('barbershops')
    .select('*')
    .eq('id', barbershopId)
    .single()
  if (error || !data) throw new Error('Barbearia não encontrada.')
  if (!data.meta_phone_id || !data.meta_access_token) {
    throw new Error('WhatsApp Bot não configurado. Configure o Meta Phone ID nas configurações.')
  }
  if (!data.whatsapp) {
    throw new Error('WhatsApp da barbearia não configurado.')
  }
  return data
}

// ─── POST /api/test-notifications/bills ──────────────────────────────────────
// Envia um lembrete de conta a pagar de exemplo

router.post('/bills', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    const settings = getSettings(shop)

    if (!settings.bills_reminder_enabled) {
      return res.status(400).json({ error: 'Lembrete de contas está desativado nas configurações.' })
    }

    const message = tplBillsReminder({
      ownerName:   shop.owner_name || 'Proprietário',
      shopName:    shop.name,
      description: 'Aluguel do espaço (TESTE)',
      amount:      formatCurrencyBR(2500),
      dueDate:     formatDateBR(new Date()),
      daysUntil:   1,
    })

    await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, shop.whatsapp, message)
    return res.json({ ok: true, message: 'Lembrete de conta enviado!', sentTo: shop.whatsapp })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/test-notifications/stock ──────────────────────────────────────

router.post('/stock', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    const settings = getSettings(shop)

    if (!settings.stock_alert_enabled) {
      return res.status(400).json({ error: 'Alerta de estoque está desativado nas configurações.' })
    }

    const message = tplStockAlert({
      ownerName: shop.owner_name || 'Proprietário',
      shopName:  shop.name,
      items: [
        { name: 'Pomada Modeladora (TESTE)', current: 2,  min: 10, unit: 'un' },
        { name: 'Lâmina Gillette (TESTE)',   current: 3,  min: 20, unit: 'pct' },
        { name: 'Álcool 70% (TESTE)',        current: 0,  min: 3,  unit: 'L' },
      ],
    })

    await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, shop.whatsapp, message)
    return res.json({ ok: true, message: 'Alerta de estoque enviado!', sentTo: shop.whatsapp })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/test-notifications/subscription ───────────────────────────────

router.post('/subscription', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    const settings = getSettings(shop)

    if (!settings.subscription_reminder_enabled) {
      return res.status(400).json({ error: 'Lembrete de mensalidade está desativado nas configurações.' })
    }

    const message = tplSubscriptionReminder({
      ownerName: shop.owner_name || 'Proprietário',
      shopName:  shop.name,
      planName:  'Plano PRO (TESTE)',
      amount:    formatCurrencyBR(299),
      dueDate:   formatDateBR(new Date(Date.now() + 3 * 86_400_000)),
      daysUntil: 3,
    })

    await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, shop.whatsapp, message)
    return res.json({ ok: true, message: 'Lembrete de mensalidade enviado!', sentTo: shop.whatsapp })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/test-notifications/appointment-confirmed ──────────────────────

router.post('/appointment-confirmed', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    const settings = getSettings(shop)

    if (!settings.appointment_confirmed) {
      return res.status(400).json({ error: 'Confirmação de agendamento está desativada nas configurações.' })
    }

    const message = tplAppointmentConfirmed({
      clientName:  'Diogo (TESTE)',
      shopName:    shop.name,
      serviceName: 'Corte + Barba',
      barberName:  'Juca',
      date:        formatDateBR(new Date()),
      time:        '14:30',
      slug:        shop.slug || shop.id,
    })

    await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, shop.whatsapp, message)
    return res.json({ ok: true, message: 'Confirmação de agendamento enviada!', sentTo: shop.whatsapp })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/test-notifications/appointment-reminder ───────────────────────

router.post('/appointment-reminder', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    const settings = getSettings(shop)

    if (!settings.appointment_reminder_1h) {
      return res.status(400).json({ error: 'Lembrete 1h antes está desativado nas configurações.' })
    }

    const message = tplAppointmentReminder1h({
      clientName:  'Diogo (TESTE)',
      shopName:    shop.name,
      serviceName: 'Corte + Barba',
      barberName:  'Juca',
      time:        '14:30',
      address:     shop.address || 'Consulte o endereço no aplicativo',
    })

    await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, shop.whatsapp, message)
    return res.json({ ok: true, message: 'Lembrete 1h enviado!', sentTo: shop.whatsapp })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/test-notifications/new-client ─────────────────────────────────

router.post('/new-client', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    const settings = getSettings(shop)

    if (!settings.new_client_alert) {
      return res.status(400).json({ error: 'Alerta de novo cliente está desativado nas configurações.' })
    }

    const message = tplNewClient({
      ownerName:   shop.owner_name || 'Proprietário',
      shopName:    shop.name,
      clientName:  'Carlos Silva (TESTE)',
      clientPhone: '5511999990000',
    })

    await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, shop.whatsapp, message)
    return res.json({ ok: true, message: 'Alerta de novo cliente enviado!', sentTo: shop.whatsapp })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/test-notifications/reactivation ───────────────────────────────

router.post('/reactivation', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    const settings = getSettings(shop)

    if (!settings.reactivation_enabled) {
      return res.status(400).json({ error: 'Reativação de clientes está desativada nas configurações.' })
    }

    const { sent, skipped } = await runReactivation(shop.id)

    if (sent === 0 && skipped === 0) {
      return res.json({ ok: true, message: 'Nenhum cliente inativo encontrado (30–60 dias) para esta barbearia.' })
    }

    return res.json({
      ok: true,
      message: `Reativação executada! Enviados: ${sent} | Ignorados/já enviado hoje: ${skipped}`,
    })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
