// src/modules/barbers/barber-auth.routes.ts

import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import jwt from 'jsonwebtoken'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'barberflow-secret'

// ─── POST /api/barber-auth/login ─────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' })
    }
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, phone, avatar_url, role, barbershop_id, password_hash')
      .eq('email', email.toLowerCase().trim())
      .eq('role', 'barber')
      .single()
    if (userError || !user) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' })
    }
    const bcrypt = require('bcryptjs')
    const valid  = await bcrypt.compare(password, user.password_hash || '')
    if (!valid) {
      return res.status(401).json({ error: 'Email ou senha inválidos.' })
    }
    const { data: profile } = await supabaseAdmin
      .from('barber_profiles')
      .select('id, commission_type, commission_value, specialties, bio, is_accepting, working_hours')
      .eq('user_id', user.id)
      .eq('barbershop_id', user.barbershop_id)
      .single()
    const { data: shop } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, slug, address, whatsapp')
      .eq('id', user.barbershop_id)
      .single()
    const token = jwt.sign(
      { userId: user.id, barbershopId: user.barbershop_id, barberId: profile?.id, role: 'barber' },
      JWT_SECRET,
      { expiresIn: '30d' }
    )
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, avatar_url: user.avatar_url, role: user.role },
      profile,
      barbershop: shop,
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/barber-auth/me ──────────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não informado.' })
    }
    const token   = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as any
    if (decoded.role !== 'barber') {
      return res.status(403).json({ error: 'Acesso negado.' })
    }
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, name, email, phone, avatar_url, role, barbershop_id')
      .eq('id', decoded.userId)
      .single()
    const { data: profile } = await supabaseAdmin
      .from('barber_profiles')
      .select('id, commission_type, commission_value, specialties, bio, is_accepting, working_hours')
      .eq('user_id', decoded.userId)
      .single()
    const { data: shop } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, slug, address, whatsapp')
      .eq('id', decoded.barbershopId)
      .single()
    return res.json({ user, profile, barbershop: shop })
  } catch (err: any) {
    return res.status(401).json({ error: 'Token inválido.' })
  }
})

// ─── PATCH /api/barber-auth/availability ─────────────────────────────────────
router.patch('/availability', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não informado.' })
    }
    const token   = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as any
    if (decoded.role !== 'barber') {
      return res.status(403).json({ error: 'Acesso negado.' })
    }
    const { is_accepting } = req.body
    if (typeof is_accepting !== 'boolean') {
      return res.status(400).json({ error: 'Campo is_accepting deve ser boolean.' })
    }
    const { error } = await supabaseAdmin
      .from('barber_profiles')
      .update({ is_accepting })
      .eq('user_id', decoded.userId)
    if (error) throw error
    return res.json({ success: true, is_accepting })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/barber-auth/appointments ───────────────────────────────────────
router.get('/appointments', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não informado.' })
    }
    const token   = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as any
    if (decoded.role !== 'barber') {
      return res.status(403).json({ error: 'Acesso negado.' })
    }

    const { period = 'day', date } = req.query
    const baseDate = date ? new Date(String(date)) : new Date()
    baseDate.setHours(0, 0, 0, 0)

    let from: Date, to: Date
    if (period === 'week') {
      const day = baseDate.getDay()
      from = new Date(baseDate); from.setDate(baseDate.getDate() - day)
      to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999)
    } else if (period === 'month') {
      from = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
      to   = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999)
    } else {
      from = new Date(baseDate); to = new Date(baseDate); to.setHours(23, 59, 59, 999)
    }

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .select(`
        id, scheduled_at, status, final_price, notes,
        services(id, name, duration_min, price),
        clients(
          id, name, phone, whatsapp, email,
          birthdate, gender, photo_url,
          hair_style, beard_style, preferences, notes,
          total_visits, total_spent, last_visit_at,
          avg_days_between_visits, is_vip, loyalty_points
        )
      `)
      .eq('barbershop_id', decoded.barbershopId)
      .eq('barber_id', decoded.barberId)
      .gte('scheduled_at', from.toISOString())
      .lte('scheduled_at', to.toISOString())
      .order('scheduled_at', { ascending: true })

    if (error) throw error

    return res.json(data)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

export default router
