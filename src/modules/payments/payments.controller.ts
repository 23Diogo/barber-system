import { Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { paymentsService } from './payments.service'

export const webhook = async (req: Request, res: Response) => {
  try {
    const provider =
      String(req.params.provider || req.query.provider || req.body?.provider || 'gateway').toLowerCase()

    const data = await paymentsService.processWebhook(
      provider,
      req.body,
      req.headers,
      req.query
    )

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

    if (status) query = query.eq('status', status as string)
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

export const markInvoicePaid = async (req: Request, res: Response) => {
  try {
    const data = await paymentsService.changeInvoiceStatus(
      req.params.id,
      req.user!.barbershopId,
      'paid'
    )
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const markInvoiceFailed = async (req: Request, res: Response) => {
  try {
    const data = await paymentsService.changeInvoiceStatus(
      req.params.id,
      req.user!.barbershopId,
      'failed'
    )
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const cancelInvoice = async (req: Request, res: Response) => {
  try {
    const data = await paymentsService.changeInvoiceStatus(
      req.params.id,
      req.user!.barbershopId,
      'canceled'
    )
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}
