import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { authenticate } from '../../middleware/auth'
import { verifyWebhook, receiveWebhook } from './whatsapp.controller'

// ─── Webhook (público — verificado pelo Meta) ─────────────────────────────────
const router = Router()
router.get('/webhook',  verifyWebhook)
router.post('/webhook', receiveWebhook)

// ─── Rotas protegidas ─────────────────────────────────────────────────────────
router.use(authenticate)

// GET /api/whatsapp/sessions — lista todas as conversas da barbearia
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select(`
        id, phone, state, last_message_at, created_at,
        clients(id, name, photo_url)
      `)
      .eq('barbershop_id', req.user!.barbershopId)
      .order('last_message_at', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/whatsapp/messages/:sessionId — mensagens de uma sessão
router.get('/messages/:sessionId', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('id, direction, type, content, media_url, is_bot, status, created_at')
      .eq('barbershop_id', req.user!.barbershopId)
      .eq('session_id', req.params.sessionId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/whatsapp/send — envio manual pelo painel
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId e message são obrigatórios.' })
    }

    const { data: session } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select('id, phone')
      .eq('id', sessionId)
      .eq('barbershop_id', req.user!.barbershopId)
      .single()

    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' })

    const { data: shop } = await supabaseAdmin
      .from('barbershops')
      .select('meta_phone_id, meta_access_token')
      .eq('id', req.user!.barbershopId)
      .single()

    if (!shop?.meta_phone_id) {
      return res.status(400).json({ error: 'WhatsApp não configurado para esta barbearia.' })
    }

    const { whatsappService } = await import('./whatsapp.service')
    await whatsappService.sendMessage(shop.meta_phone_id, shop.meta_access_token, session.phone, message)

    // Salva a mensagem enviada
    await supabaseAdmin.from('whatsapp_messages').insert({
      barbershop_id: req.user!.barbershopId,
      session_id:    sessionId,
      direction:     'out',
      type:          'text',
      content:       message,
      status:        'sent',
      is_bot:        false,
    })

    res.json({ success: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
