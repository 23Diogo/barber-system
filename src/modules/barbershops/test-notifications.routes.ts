// src/modules/barbershops/test-notifications.routes.ts
// ⚠️  REMOVER ANTES DE IR PARA PRODUÇÃO
import { Router, Request, Response } from 'express'
import { supabaseAdmin }   from '../../config/supabase'
import { authenticate }    from '../../middleware/auth'
import { whatsappService } from '../whatsapp/whatsapp.service'
import { runReactivation } from '../../jobs/reactivation'
import { getSettings }     from '../../services/notification.service'

const router = Router()
router.use(authenticate)

async function getShop(barbershopId: string) {
  const { data, error } = await supabaseAdmin
    .from('barbershops').select('*').eq('id', barbershopId).single()
  if (error || !data) throw new Error('Barbearia não encontrada.')
  if (!data.meta_phone_id || !data.meta_access_token) {
    throw new Error('WhatsApp Bot não configurado. Configure o Phone Number ID e Access Token nas configurações.')
  }
  if (!data.whatsapp) throw new Error('WhatsApp da barbearia não configurado.')
  return data
}

async function sendTestMessage(shop: any, nome: string, mensagem: string): Promise<string> {
  const { meta_phone_id: pid, meta_access_token: token, whatsapp: to } = shop
  try {
    await whatsappService.sendNotificationTemplate(pid, token, to, { nome, barbearia: shop.name, mensagem })
    return 'template'
  } catch {
    try {
      await whatsappService.sendHelloWorld(pid, token, to)
      return 'hello_world'
    } catch {
      await whatsappService.sendMessage(pid, token, to, `${nome} — ${mensagem}`)
      return 'text'
    }
  }
}

router.post('/bills', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    if (!getSettings(shop).bills_reminder_enabled)
      return res.status(400).json({ error: 'Lembrete de contas está desativado nas configurações.' })
    const mode = await sendTestMessage(shop, shop.owner_name || 'Proprietário',
      'Conta: Aluguel do espaço (TESTE) — R$ 2.500,00 vence amanhã!')
    return res.json({ ok: true, message: `Lembrete de conta enviado! (modo: ${mode})`, sentTo: shop.whatsapp })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.post('/stock', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    if (!getSettings(shop).stock_alert_enabled)
      return res.status(400).json({ error: 'Alerta de estoque está desativado nas configurações.' })
    const mode = await sendTestMessage(shop, shop.owner_name || 'Proprietário',
      'Estoque baixo: Pomada Modeladora (2/10), Álcool 70% (0/3), Toalha Descartável (15/100)')
    return res.json({ ok: true, message: `Alerta de estoque enviado! (modo: ${mode})`, sentTo: shop.whatsapp })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.post('/subscription', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    if (!getSettings(shop).subscription_reminder_enabled)
      return res.status(400).json({ error: 'Lembrete de mensalidade está desativado nas configurações.' })
    const mode = await sendTestMessage(shop, shop.owner_name || 'Proprietário',
      'Mensalidade BarberFlow — Plano PRO R$ 299,00 vence em 3 dias!')
    return res.json({ ok: true, message: `Lembrete de mensalidade enviado! (modo: ${mode})`, sentTo: shop.whatsapp })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.post('/appointment-confirmed', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    if (!getSettings(shop).appointment_confirmed)
      return res.status(400).json({ error: 'Confirmação de agendamento está desativada nas configurações.' })
    const mode = await sendTestMessage(shop, 'Diogo (TESTE)',
      `Agendamento confirmado na ${shop.name}! Corte + Barba com Juca — hoje às 14:30`)
    return res.json({ ok: true, message: `Confirmação enviada! (modo: ${mode})`, sentTo: shop.whatsapp })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.post('/appointment-reminder', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    if (!getSettings(shop).appointment_reminder_1h)
      return res.status(400).json({ error: 'Lembrete 1h antes está desativado nas configurações.' })
    const mode = await sendTestMessage(shop, 'Diogo (TESTE)',
      `Lembrete: horário em 1h na ${shop.name}! Corte + Barba com Juca às 14:30`)
    return res.json({ ok: true, message: `Lembrete 1h enviado! (modo: ${mode})`, sentTo: shop.whatsapp })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.post('/new-client', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    if (!getSettings(shop).new_client_alert)
      return res.status(400).json({ error: 'Alerta de novo cliente está desativado nas configurações.' })
    const mode = await sendTestMessage(shop, shop.owner_name || 'Proprietário',
      'Novo cliente cadastrado: Carlos Silva (TESTE) — WhatsApp: (11) 99999-0000')
    return res.json({ ok: true, message: `Alerta de novo cliente enviado! (modo: ${mode})`, sentTo: shop.whatsapp })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

router.post('/reactivation', async (req: Request, res: Response) => {
  try {
    const shop = await getShop(req.user!.barbershopId)
    if (!getSettings(shop).reactivation_enabled)
      return res.status(400).json({ error: 'Reativação de clientes está desativada nas configurações.' })
    const { sent, skipped } = await runReactivation(shop.id)
    if (sent === 0 && skipped === 0)
      return res.json({ ok: true, message: 'Nenhum cliente inativo encontrado (30–60 dias).' })
    return res.json({ ok: true, message: `Reativação executada! Enviados: ${sent} | Ignorados: ${skipped}` })
  } catch (err: any) { return res.status(400).json({ error: err.message }) }
})

export default router
