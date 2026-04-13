import { Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { appointmentsService } from './appointments.service'

export const list = async (req: Request, res: Response) => {
  try {
    const { date, barberId, status } = req.query
    let q = supabaseAdmin
      .from('appointments')
      .select('*, clients(name, phone, photo_url), barber_profiles(users(name)), services(name, duration_min, price)')
      .eq('barbershop_id', req.user!.barbershopId)
      .order('scheduled_at')

    if (date)     { q = q.gte('scheduled_at', `${date}T00:00:00Z`).lte('scheduled_at', `${date}T23:59:59Z`) }
    if (barberId) { q = q.eq('barber_id', barberId as string) }
    if (status)   { q = q.eq('status', status as string) }

    const { data, error } = await q
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const slots = async (req: Request, res: Response) => {
  try {
    const { barberId, serviceId, date } = req.query
    res.json(await appointmentsService.getAvailableSlots(req.user!.barbershopId, barberId as string, serviceId as string, date as string))
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const create = async (req: Request, res: Response) => {
  try { res.status(201).json(await appointmentsService.create(req.user!.barbershopId, req.body)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const update = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('appointments').update(req.body).eq('id', req.params.id).eq('barbershop_id', req.user!.barbershopId).select().single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const cancel = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin.from('appointments')
      .update({ status: 'cancelled', cancelled_reason: req.body.reason, cancelled_at: new Date() })
      .eq('id', req.params.id).eq('barbershop_id', req.user!.barbershopId).select().single()
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const complete = async (req: Request, res: Response) => {
  try { res.json(await appointmentsService.complete(req.params.id, req.user!.barbershopId, req.body.paymentMethod)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const rate = async (req: Request, res: Response) => {
  try {
    const { rating, comment, clientId } = req.body
    await supabaseAdmin.from('reviews').insert({ barbershop_id: req.user!.barbershopId, appointment_id: req.params.id, client_id: clientId, rating, comment })
    await supabaseAdmin.from('appointments').update({ rating, rating_comment: comment, rated_at: new Date() }).eq('id', req.params.id)
    res.json({ success: true })
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}
