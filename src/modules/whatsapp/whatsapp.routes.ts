import { Router, Request, Response } from 'express'
import axios from 'axios'
import { supabaseAdmin } from '../../config/supabase'
import { authenticate } from '../../middleware/auth'
import { verifyWebhook, receiveWebhook } from './whatsapp.controller'

const router = Router()

// ─── Webhook público (verificado pela Meta) ───────────────────────────────────
router.get('/webhook',  verifyWebhook)
router.post('/webhook', receiveWebhook)

// ─── Rotas protegidas ─────────────────────────────────────────────────────────
router.use(authenticate)

// ─── GET /api/whatsapp/status ─────────────────────────────────────────────────
// Retorna o status de conexão do WhatsApp da barbearia
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { data: shop, error } = await supabaseAdmin
      .from('barbershops')
      .select('meta_phone_id, meta_access_token, whatsapp, name')
      .eq('id', req.user!.barbershopId)
      .single()

    if (error) throw error

    const connected = Boolean(shop?.meta_phone_id && shop?.meta_access_token)

    res.json({
      connected,
      phone_number_id: shop?.meta_phone_id  || null,
      business_phone:  shop?.whatsapp        || null,
      shop_name:       shop?.name            || null,
    })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /api/whatsapp/connect ───────────────────────────────────────────────
// Recebe o code do Embedded Signup, troca por token, salva na barbearia
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'code é obrigatório.' })

    const appId     = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET

    if (!appId || !appSecret) {
      return res.status(500).json({ error: 'META_APP_ID ou META_APP_SECRET não configurados.' })
    }

    // 1. Troca o code por access token
    const tokenResp = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id:     appId,
        client_secret: appSecret,
        code,
      }
    })

    const accessToken = tokenResp.data.access_token
    if (!accessToken) {
      return res.status(400).json({ error: 'Não foi possível obter o token de acesso.' })
    }

    // 2. Busca as contas WhatsApp Business vinculadas
    const wabaResp = await axios.get('https://graph.facebook.com/v19.0/me/businesses', {
      params: {
        fields:       'whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}',
        access_token: accessToken,
      }
    })

    // Pega o primeiro número disponível
    const businesses = wabaResp.data.data || []
    let phoneNumberId: string | null = null
    let wabaId:        string | null = null
    let displayPhone:  string | null = null

    for (const biz of businesses) {
      const accounts = biz.whatsapp_business_accounts?.data || []
      for (const waba of accounts) {
        wabaId = waba.id
        const phones = waba.phone_numbers?.data || []
        if (phones.length > 0) {
          phoneNumberId = phones[0].id
          displayPhone  = phones[0].display_phone_number
          break
        }
      }
      if (phoneNumberId) break
    }

    if (!phoneNumberId) {
      return res.status(400).json({
        error: 'Nenhum número de telefone encontrado na conta WhatsApp Business.'
      })
    }

    // 3. Configura o webhook automaticamente para este WABA
    if (wabaId) {
      try {
        const webhookUrl = `${process.env.API_BASE_URL || 'https://api.bbarberflow.com.br'}/api/whatsapp/webhook`
        await axios.post(
          `https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`,
          {},
          {
            params: { access_token: accessToken },
            headers: { 'Content-Type': 'application/json' }
          }
        )
        console.log(`✅ Webhook configurado para WABA ${wabaId}: ${webhookUrl}`)
      } catch (webhookErr: any) {
        // Não é crítico — o webhook já pode estar configurado no app
        console.warn('⚠️ Webhook config:', webhookErr.response?.data || webhookErr.message)
      }
    }

    // 4. Salva na barbearia
    const { error: updateError } = await supabaseAdmin
      .from('barbershops')
      .update({
        meta_phone_id:    phoneNumberId,
        meta_access_token: accessToken,
        meta_waba_id:     wabaId,
        whatsapp:         displayPhone,
      })
      .eq('id', req.user!.barbershopId)

    if (updateError) throw updateError

    res.json({
      success:          true,
      phone_number_id:  phoneNumberId,
      display_phone:    displayPhone,
      waba_id:          wabaId,
    })

  } catch (err: any) {
    console.error('❌ [WA] connect error:', err.response?.data || err.message)
    res.status(400).json({ error: err.response?.data?.error?.message || err.message })
  }
})

// ─── POST /api/whatsapp/connect/manual ───────────────────────────────────────
// Conecta manualmente informando phone_number_id e access_token
// Útil durante desenvolvimento e para os primeiros clientes
router.post('/connect/manual', async (req: Request, res: Response) => {
  try {
    const { phone_number_id, access_token, display_phone } = req.body

    if (!phone_number_id || !access_token) {
      return res.status(400).json({ error: 'phone_number_id e access_token são obrigatórios.' })
    }

    // Valida o token fazendo uma chamada à Meta
    try {
      await axios.get(
        `https://graph.facebook.com/v19.0/${phone_number_id}`,
        { params: { access_token } }
      )
    } catch {
      return res.status(400).json({ error: 'Token ou Phone Number ID inválidos.' })
    }

    const { error } = await supabaseAdmin
      .from('barbershops')
      .update({
        meta_phone_id:    phone_number_id,
        meta_access_token: access_token,
        whatsapp:         display_phone || null,
      })
      .eq('id', req.user!.barbershopId)

    if (error) throw error

    res.json({ success: true, phone_number_id, display_phone })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── DELETE /api/whatsapp/disconnect ─────────────────────────────────────────
// Desconecta o WhatsApp da barbearia
router.delete('/disconnect', async (req: Request, res: Response) => {
  try {
    const { error } = await supabaseAdmin
      .from('barbershops')
      .update({
        meta_phone_id:    null,
        meta_access_token: null,
        meta_waba_id:     null,
      })
      .eq('id', req.user!.barbershopId)

    if (error) throw error

    res.json({ success: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── GET /api/whatsapp/sessions ───────────────────────────────────────────────
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

// ─── GET /api/whatsapp/messages/:sessionId ────────────────────────────────────
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

// ─── POST /api/whatsapp/send ──────────────────────────────────────────────────
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
