import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { supabaseAdmin } from '../../config/supabase'

const getMe = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('barbershops')
      .select('*, plans(*)')
      .eq('id', req.user!.barbershopId)
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const updateMe = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('barbershops')
      .update(req.body)
      .eq('id', req.user!.barbershopId)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const getPublic = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, slug, logo_url, cover_url, address, city, working_hours, is_active, absence_message')
      .eq('slug', req.params.slug)
      .single()
    if (error) throw error
    if (!data.is_active) {
      return res.json({ is_active: false, absence_message: data.absence_message })
    }
    res.json(data)
  } catch (err: any) { res.status(404).json({ error: 'Barbearia não encontrada' }) }
}

const router = Router()
router.get('/public/:slug', getPublic)          // rota pública para o bot/link de agendamento
router.use(authenticate)
router.get('/me',   getMe)
router.patch('/me', updateMe)
export default router
