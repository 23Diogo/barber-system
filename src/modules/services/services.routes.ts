import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'

const list = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('services')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const create = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('services')
      .insert({ ...req.body, barbershop_id: req.user!.barbershopId })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const update = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('services')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .select().single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const remove = async (req: Request, res: Response) => {
  try {
    await supabaseAdmin.from('services')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
    res.json({ success: true })
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const router = Router()
router.use(authenticate, checkLicense)
router.get('/',      list)
router.post('/',     create)
router.patch('/:id', update)
router.delete('/:id',remove)
export default router
