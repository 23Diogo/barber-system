import { Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { plansService } from './plans.service'

export const list = async (req: Request, res: Response) => {
  try {
    const { active, q } = req.query

    let query = supabaseAdmin
      .from('plans')
      .select(`
        *,
        plan_service_entitlements(*, services(id, name))
      `)
      .eq('barbershop_id', req.user!.barbershopId)
      .order('created_at', { ascending: false })

    if (active === 'true')  query = query.eq('is_active', true)
    if (active === 'false') query = query.eq('is_active', false)
    if (q)                  query = query.ilike('name', `%${q}%`)

    const { data, error } = await query
    if (error) throw error

    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const getOne = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('plans')
      .select(`
        *,
        plan_service_entitlements(*, services(id, name))
      `)
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .single()

    if (error) throw error

    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const create = async (req: Request, res: Response) => {
  try {
    const data = await plansService.create(req.user!.barbershopId, req.body)
    res.status(201).json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const update = async (req: Request, res: Response) => {
  try {
    const data = await plansService.update(req.params.id, req.user!.barbershopId, req.body)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}
