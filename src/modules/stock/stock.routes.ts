import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'

const list = async (req: Request, res: Response) => {
  try {
    const { low } = req.query
    if (low) {
      const { data, error } = await supabaseAdmin
        .from('vw_low_stock')
        .select('*')
        .eq('barbershop_id', req.user!.barbershopId)
      if (error) throw error
      return res.json(data)
    }
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const create = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({ ...req.body, barbershop_id: req.user!.barbershopId })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const update = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .select().single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const addMovement = async (req: Request, res: Response) => {
  try {
    const { type, quantity, notes, unit_cost } = req.body

    // Buscar estoque atual
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('current_stock')
      .eq('id', req.params.id)
      .single()

    const before = product?.current_stock ?? 0
    const after  = type === 'in'
      ? before + quantity
      : type === 'adjustment'
        ? quantity
        : before - quantity

    const { data, error } = await supabaseAdmin
      .from('stock_movements')
      .insert({
        product_id: req.params.id,
        barbershop_id: req.user!.barbershopId,
        type, quantity, notes, unit_cost,
        stock_before: before,
        stock_after: after,
        total_cost: unit_cost ? unit_cost * quantity : null,
        created_by: req.user!.userId
      })
      .select().single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const getMovements = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('stock_movements')
      .select('*')
      .eq('product_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const router = Router()
router.use(authenticate, checkLicense)
router.get('/',                    list)
router.post('/',                   create)
router.patch('/:id',               update)
router.post('/:id/movement',       addMovement)
router.get('/:id/movements',       getMovements)
export default router
