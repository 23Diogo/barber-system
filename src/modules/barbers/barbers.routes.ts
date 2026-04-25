import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'
import bcrypt from 'bcryptjs'

const list = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('barber_profiles')
      .select('*, users(id, name, email, phone, avatar_url)')
      .eq('barbershop_id', req.user!.barbershopId)
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const create = async (req: Request, res: Response) => {
  try {
    const {
      name, email, phone,
      commission_value, commission_type, specialties,
      bio, is_accepting, working_hours,
      password, // ← senha inicial (opcional, padrão: barberflow123)
    } = req.body

    // Hash da senha — padrão "barberflow123" se não informada
    const rawPassword   = password || 'barberflow123'
    const password_hash = await bcrypt.hash(rawPassword, 10)

    const { data: user, error: uErr } = await supabaseAdmin
      .from('users')
      .insert({
        barbershop_id: req.user!.barbershopId,
        name,
        email,
        phone,
        role: 'barber',
        password_hash,
      })
      .select()
      .single()

    if (uErr) throw new Error(uErr.message)

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('barber_profiles')
      .insert({
        user_id:          user.id,
        barbershop_id:    req.user!.barbershopId,
        commission_value,
        commission_type,
        specialties,
        bio:              bio          || null,
        is_accepting:     is_accepting ?? true,
        working_hours:    working_hours || null,
      })
      .select()
      .single()

    if (pErr) throw new Error(pErr.message)

    res.status(201).json({
      user,
      profile,
      // Retorna a senha padrão para o dono repassar ao barbeiro
      temp_password: password ? undefined : 'barberflow123',
    })
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const update = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('barber_profiles')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const getPerformance = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('vw_barber_performance')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .order('total_revenue', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const uploadAvatar = async (req: Request, res: Response) => {
  try {
    const barbershopId = req.user!.barbershopId
    const profileId    = req.params.id
    const { imageBase64, mimeType } = req.body

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'imageBase64 e mimeType são obrigatórios.' })
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(mimeType)) {
      return res.status(400).json({ error: 'Formato inválido. Use JPG, PNG ou WEBP.' })
    }

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('barber_profiles')
      .select('user_id')
      .eq('id', profileId)
      .eq('barbershop_id', barbershopId)
      .single()

    if (pErr || !profile) {
      return res.status(404).json({ error: 'Barbeiro não encontrado.' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer     = Buffer.from(base64Data, 'base64')
    const ext        = mimeType.split('/')[1]
    const filePath   = `barbers/${barbershopId}/${profile.user_id}.${ext}`

    const { error: upErr } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, buffer, { contentType: mimeType, upsert: true })

    if (upErr) throw new Error(upErr.message)

    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const avatarUrl = urlData.publicUrl

    const { error: uErr } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', profile.user_id)

    if (uErr) throw new Error(uErr.message)

    res.json({ avatarUrl })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

// ─── PATCH /api/barbers/:id/password — reset de senha pelo dono ───────────────
const resetPassword = async (req: Request, res: Response) => {
  try {
    const { password } = req.body
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' })
    }

    const { data: profile } = await supabaseAdmin
      .from('barber_profiles')
      .select('user_id')
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .single()

    if (!profile) return res.status(404).json({ error: 'Barbeiro não encontrado.' })

    const password_hash = await bcrypt.hash(password, 10)

    await supabaseAdmin
      .from('users')
      .update({ password_hash })
      .eq('id', profile.user_id)

    res.json({ ok: true, message: 'Senha atualizada com sucesso.' })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

const router = Router()
router.use(authenticate, checkLicense)
router.get('/',                    list)
router.get('/performance',         getPerformance)
router.post('/',                   create)
router.patch('/:id',               update)
router.post('/:id/avatar',         uploadAvatar)
router.patch('/:id/password',      resetPassword)
export default router
