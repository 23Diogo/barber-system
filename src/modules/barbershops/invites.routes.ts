// src/modules/barbershops/invites.routes.ts
// Rotas de convite de clientes
//
// POST /api/barbershops/invites        → registra um envio (canal: link | whatsapp | qr)
// GET  /api/barbershops/invites/stats  → retorna { sent, converted, rate }

import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { authenticate } from '../../middleware/auth'

const router = Router()
router.use(authenticate)

// ─── POST /api/barbershops/invites ────────────────────────────────────────────
// Body: { channel: 'link' | 'whatsapp' | 'qr' }

router.post('/invites', async (req: Request, res: Response) => {
  try {
    const { channel } = req.body
    const validChannels = ['link', 'whatsapp', 'qr']

    if (!channel || !validChannels.includes(channel)) {
      return res.status(400).json({
        error: `Canal inválido. Use: ${validChannels.join(', ')}.`,
      })
    }

    const { data, error } = await supabaseAdmin
      .from('client_invites')
      .insert({
        barbershop_id: req.user!.barbershopId,
        channel,
      })
      .select()
      .single()

    if (error) throw error

    return res.status(201).json(data)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── GET /api/barbershops/invites/stats ───────────────────────────────────────
// Retorna: { sent, converted, rate }

router.get('/invites/stats', async (req: Request, res: Response) => {
  try {
    const { count: sent, error: sentError } = await supabaseAdmin
      .from('client_invites')
      .select('*', { count: 'exact', head: true })
      .eq('barbershop_id', req.user!.barbershopId)

    if (sentError) throw sentError

    const { count: converted, error: convertedError } = await supabaseAdmin
      .from('client_invites')
      .select('*', { count: 'exact', head: true })
      .eq('barbershop_id', req.user!.barbershopId)
      .not('client_id', 'is', null)

    if (convertedError) throw convertedError

    const totalSent      = sent      ?? 0
    const totalConverted = converted ?? 0
    const rate           = totalSent > 0
      ? Math.round((totalConverted / totalSent) * 100)
      : 0

    return res.json({
      sent:      totalSent,
      converted: totalConverted,
      rate,
    })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
