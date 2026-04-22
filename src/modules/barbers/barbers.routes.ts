import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'

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
    const { name, email, phone, commission_value, commission_type, specialties } = req.body
    const { data: user, error: uErr } = await supabaseAdmin
      .from('users')
      .insert({ barbershop_id: req.user!.barbershopId, name, email, phone, role: 'barber' })
      .select().single()
    if (uErr) throw new Error(uErr.message)
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('barber_profiles')
      .insert({ user_id: user.id, barbershop_id: req.user!.barbershopId, commission_value, commission_type, specialties })
      .select().single()
    if (pErr) throw new Error(pErr.message)
    res.status(201).json({ user, profile })
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const update = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('barber_profiles')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .select().single()
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

// ─── Upload de avatar ─────────────────────────────────────────────────────────
// Recebe: { imageBase64: string, mimeType: string }
// Faz upload no bucket "avatars" do Supabase Storage
// Salva a URL pública em users.avatar_url

const uploadAvatar = async (req: Request, res: Response) => {
  try {
    const barbershopId = req.user!.barbershopId
    const profileId    = req.params.id
    const { imageBase64, mimeType } = req.body

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'imageBase64 e mimeType são obrigatórios.' })
    }

    // Valida tipo
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(mimeType)) {
      return res.status(400).json({ error: 'Formato inválido. Use JPG, PNG ou WEBP.' })
    }

    // Busca o user_id do barber_profile
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('barber_profiles')
      .select('user_id')
      .eq('id', profileId)
      .eq('barbershop_id', barbershopId)
      .single()

    if (pErr || !profile) {
      return res.status(404).json({ error: 'Barbeiro não encontrado.' })
    }

    // Converte base64 para Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer     = Buffer.from(base64Data, 'base64')

    // Define o path do arquivo no bucket
    const ext      = mimeType.split('/')[1]
    const filePath = `barbers/${barbershopId}/${profile.user_id}.${ext}`

    // Upload para o bucket "avatars"
    const { error: upErr } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true, // substitui se já existir
      })

    if (upErr) throw new Error(upErr.message)

    // Pega a URL pública
    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const avatarUrl = urlData.publicUrl

    // Salva a URL no users
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

const router = Router()
router.use(authenticate, checkLicense)
router.get('/',              list)
router.get('/performance',   getPerformance)
router.post('/',             create)
router.patch('/:id',         update)
router.post('/:id/avatar',   uploadAvatar)   // ← novo
export default router
