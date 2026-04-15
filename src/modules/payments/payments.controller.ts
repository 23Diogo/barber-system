import { Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { paymentsService } from './payments.service'

export const webhook = async (req: Request, res: Response) => {
  try {
    const data = await paymentsService.processWebhook(req.body, req.headers)
    res.status(200).json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const listInvoices = async (req: Request, res: Response) => {
  try {
    const { status, subscription_id } = req.query

    let query = supabaseAdmin
      .from('subscription_invoices')
      .select(`
        *,
        subscriptions(
          id,
          client_id,
          plan_id
        )
      `)
      .eq('barbershop_id', req.user!.barbershopId)
      .order('created_at', { ascending: false })

    if (status)          query = query.eq('status', status as string)
    if (subscription_id) query = query.eq('subscription_id', subscription_id as string)

    const { data, error } = await query
    if (error) throw error

    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const createManualInvoice = async (req: Request, res: Response) => {
  try {
    const data = await paymentsService.createManualInvoice(req.user!.barbershopId, req.body)
    res.status(201).json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}
