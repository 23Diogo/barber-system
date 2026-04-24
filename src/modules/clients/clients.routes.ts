import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'

const list = async (req: Request, res: Response) => {
  try {
    const { q, vip, inactive } = req.query
    let query = supabaseAdmin
      .from('clients')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .eq('is_active', true)
      .order('name')
    if (q)        query = query.ilike('name', `%${q}%`)
    if (vip)      query = query.eq('is_vip', true)
    if (inactive) query = query.lt('last_visit_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const getOne = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select(`
        *,
        client_style_history(*, barber_profiles(users(name)), services(name)),
        appointments(id, scheduled_at, status, final_price, services(name), barber_profiles(users(name)))
      `)
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const create = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .insert({ ...req.body, barbershop_id: req.user!.barbershopId })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const update = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const addStyleHistory = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('client_style_history')
      .insert({ ...req.body, client_id: req.params.id })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

// ─── GET /api/clients/new-count?since=ISO_DATE ────────────────────────────────
// Retorna quantos clientes foram criados após a data informada.
// Usado pelo badge da sidebar para alertar o dono sobre novos cadastros via portal.

const newCount = async (req: Request, res: Response) => {
  try {
    const { since } = req.query

    if (!since || typeof since !== 'string') {
      return res.status(400).json({ error: 'Parâmetro "since" obrigatório (ISO date).' })
    }

    const sinceDate = new Date(since)
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: 'Parâmetro "since" inválido.' })
    }

    const { count, error } = await supabaseAdmin
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('barbershop_id', req.user!.barbershopId)
      .gt('created_at', sinceDate.toISOString())

    if (error) throw error

    return res.json({ count: count ?? 0 })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
}

const router = Router()
router.use(authenticate, checkLicense)

// IMPORTANTE: /new-count antes de /:id para não ser capturado como parâmetro
router.get('/new-count',          newCount)
router.get('/',                   list)
router.get('/:id',                getOne)
router.post('/',                  create)
router.patch('/:id',              update)
router.post('/:id/style-history', addStyleHistory)

export default router
