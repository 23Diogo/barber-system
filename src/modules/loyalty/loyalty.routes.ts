import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'

const getProgram = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('loyalty_programs')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .maybeSingle()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const upsertProgram = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('loyalty_programs')
      .upsert({ ...req.body, barbershop_id: req.user!.barbershopId })
      .select().single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const listRewards = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('loyalty_rewards')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .eq('is_active', true)
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const createReward = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('loyalty_rewards')
      .insert({ ...req.body, barbershop_id: req.user!.barbershopId })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const getClientPoints = async (req: Request, res: Response) => {
  try {
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('loyalty_points, name')
      .eq('id', req.params.clientId)
      .single()

    const { data: history } = await supabaseAdmin
      .from('loyalty_transactions')
      .select('*')
      .eq('client_id', req.params.clientId)
      .order('created_at', { ascending: false })
      .limit(20)

    res.json({ client, history })
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const router = Router()
router.use(authenticate, checkLicense)
router.get('/program',                  getProgram)
router.put('/program',                  upsertProgram)
router.get('/rewards',                  listRewards)
router.post('/rewards',                 createReward)
router.get('/client/:clientId',         getClientPoints)
export default router
