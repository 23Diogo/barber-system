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

const router = Router()
router.use(authenticate, checkLicense)
router.get('/',              list)
router.get('/performance',   getPerformance)
router.post('/',             create)
router.patch('/:id',         update)
export default router
