import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { authenticate } from '../../middleware/auth'

const router = Router()
router.use(authenticate)

// GET /api/barbershops/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('barbershops')
      .select('*')
      .eq('id', req.user!.barbershopId)
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH /api/barbershops/settings
router.patch('/settings', async (req: Request, res: Response) => {
  try {
    const allowed = [
      'notification_settings',
      'absence_message',
      'working_hours',
      'booking_advance_days',
      'cancellation_hours',
      'name',
      'phone',
      'whatsapp',
      'address',
      'city',
      'state',
      'zip_code',
      'meta_phone_id',
      'meta_access_token',
    ]

    const payload: Record<string, any> = {}
    for (const key of allowed) {
      if (key in req.body) payload[key] = req.body[key]
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: 'Nenhum campo válido enviado.' })
    }

    payload.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('barbershops')
      .update(payload)
      .eq('id', req.user!.barbershopId)
      .select()
      .single()

    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
