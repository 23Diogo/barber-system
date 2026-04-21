import { Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { paymentsService } from './payments.service'

export const webhook = async (req: Request, res: Response) => {
  // Responde 200 imediatamente — o MP exige resposta em até 22s
  res.status(200).json({ received: true })

  try {
    // Ignora pings de teste do MP (live_mode: false)
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    if (body?.live_mode === false) return

    // Só processa eventos de pagamento
    if (body?.type !== 'payment' && body?.action !== 'payment.updated' && body?.action !== 'payment.created') return

    const provider = String(
      req.params.provider || req.query.provider || body?.provider || 'mercadopago'
    ).toLowerCase()

    await paymentsService.processWebhook(provider, body, req.headers, req.query)
  } catch (err: any) {
    console.error('❌ [webhook] Erro ao processar:', err?.message)
  }
}

export const listInvoices = async (req: Request, res: Response) => {
  try {
    const { status, subscription_id } = req.query
    let query = supabaseAdmin
      .from('subscription_invoices')
      .select(`*, subscriptions(id, client_id, plan_id)`)
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
    res.status(201).json(await paymentsService.createManualInvoice(req.user!.barbershopId, req.body))
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const markInvoicePaid = async (req: Request, res: Response) => {
  try {
    res.json(await paymentsService.changeInvoiceStatus(req.params.id, req.user!.barbershopId, 'paid'))
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const markInvoiceFailed = async (req: Request, res: Response) => {
  try {
    res.json(await paymentsService.changeInvoiceStatus(req.params.id, req.user!.barbershopId, 'failed'))
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const cancelInvoice = async (req: Request, res: Response) => {
  try {
    res.json(await paymentsService.changeInvoiceStatus(req.params.id, req.user!.barbershopId, 'canceled'))
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}
