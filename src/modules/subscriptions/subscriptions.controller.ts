import { Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { subscriptionsService } from './subscriptions.service'

export const list = async (req: Request, res: Response) => {
  try {
    const { status, client_id } = req.query

    let query = supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        clients(id, name, phone, whatsapp),
        plans(*),
        subscription_cycles(*),
        subscription_invoices(*)
      `)
      .eq('barbershop_id', req.user!.barbershopId)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status as string)
    if (client_id) query = query.eq('client_id', client_id as string)

    const { data, error } = await query
    if (error) throw error

    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const getActiveByClient = async (req: Request, res: Response) => {
  try {
    const data = await subscriptionsService.getActiveByClient(
      req.params.clientId,
      req.user!.barbershopId
    )

    res.json(data || null)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const getOne = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        *,
        clients(id, name, phone, whatsapp),
        plans(*),
        subscription_cycles(
          *,
          subscription_cycle_service_balances(*, services(id, name))
        ),
        subscription_invoices(*),
        subscription_consumptions(
          *,
          appointments(id, scheduled_at, status),
          services(id, name)
        )
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
    const data = await subscriptionsService.create(req.user!.barbershopId, req.body)
    res.status(201).json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const update = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .select()
      .single()

    if (error) throw error

    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const activate = async (req: Request, res: Response) => {
  try {
    const data = await subscriptionsService.changeStatus(
      req.params.id,
      req.user!.barbershopId,
      'active'
    )
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const pause = async (req: Request, res: Response) => {
  try {
    const data = await subscriptionsService.changeStatus(
      req.params.id,
      req.user!.barbershopId,
      'paused'
    )
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const reactivate = async (req: Request, res: Response) => {
  try {
    const data = await subscriptionsService.changeStatus(
      req.params.id,
      req.user!.barbershopId,
      'active'
    )
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const cancel = async (req: Request, res: Response) => {
  try {
    const data = await subscriptionsService.changeStatus(
      req.params.id,
      req.user!.barbershopId,
      'canceled'
    )
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const generateNextCycle = async (req: Request, res: Response) => {
  try {
    const dueAt = req.body?.due_at || new Date().toISOString()
    const data = await subscriptionsService.generateNextCycle(req.params.id, req.user!.barbershopId, dueAt)
    res.status(201).json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const consume = async (req: Request, res: Response) => {
  try {
    const data = await subscriptionsService.consume(req.params.id, req.user!.barbershopId, req.body)
    res.status(200).json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}
