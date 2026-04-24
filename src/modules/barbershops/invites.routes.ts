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
// sent      → total de convites enviados pelo dono
// converted → clientes da barbearia que possuem conta no portal (client_accounts)
//             proxy correto: se tem conta no portal, entrou pelo link de convite
// rate      → percentual (0–100)

router.get('/invites/stats', async (req: Request, res: Response) => {
  try {
    const barbershopId = req.user!.barbershopId

    // 1. Total de convites enviados
    const { count: sent, error: sentError } = await supabaseAdmin
      .from('client_invites')
      .select('*', { count: 'exact', head: true })
      .eq('barbershop_id', barbershopId)

    if (sentError) throw sentError

    // 2. IDs dos clientes desta barbearia
    const { data: clientRows, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('barbershop_id', barbershopId)

    if (clientError) throw clientError

    const clientIds = (clientRows ?? []).map((c: any) => c.id)

    // 3. Quantos desses clientes criaram conta no portal
    let converted = 0
    if (clientIds.length > 0) {
      const { count, error: accountError } = await supabaseAdmin
        .from('client_accounts')
        .select('*', { count: 'exact', head: true })
        .in('client_id', clientIds)

      if (accountError) throw accountError
      converted = count ?? 0
    }

    const totalSent = sent ?? 0
    const rate      = totalSent > 0
      ? Math.round((converted / totalSent) * 100)
      : 0

    return res.json({ sent: totalSent, converted, rate })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
