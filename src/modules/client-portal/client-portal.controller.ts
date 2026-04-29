import { Request, Response } from 'express'
import { clientPortalService } from './client-portal.service'

export const getPortalContext = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.getContext(req.clientAuth!)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const listPortalServices = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.listServices(req.clientAuth!)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const listPortalBarbers = async (req: Request, res: Response) => {
  try {
    const serviceId = String(req.query.serviceId || '').trim()
    res.json(await clientPortalService.listBarbers(req.clientAuth!, { serviceId }))
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const listPortalAvailableSlots = async (req: Request, res: Response) => {
  try {
    const barberId  = String(req.query.barberId  || '').trim()
    const serviceId = String(req.query.serviceId || '').trim()
    const date      = String(req.query.date      || '').trim()
    res.json(await clientPortalService.getAvailableSlots(req.clientAuth!, { barberId, serviceId, date }))
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const createPortalAppointment = async (req: Request, res: Response) => {
  try { res.status(201).json(await clientPortalService.createAppointment(req.clientAuth!, req.body)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const listPortalAppointments = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.listAppointments(req.clientAuth!)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const cancelPortalAppointment = async (req: Request, res: Response) => {
  try {
    res.json(await clientPortalService.cancelAppointment(req.clientAuth!, req.params.id, req.body?.reason))
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const ratePortalAppointment = async (req: Request, res: Response) => {
  try {
    res.json(await clientPortalService.rateAppointment(req.clientAuth!, req.params.id, req.body))
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const listPortalPlans = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.listPlans(req.clientAuth!)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const getPortalSubscription = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.getSubscription(req.clientAuth!)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const createPortalSubscriptionCheckout = async (req: Request, res: Response) => {
  try { res.status(201).json(await clientPortalService.createSubscriptionCheckout(req.clientAuth!, req.body)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const cancelPortalPendingSubscription = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.cancelPendingSubscription(req.clientAuth!, req.body)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const getPortalProfile = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.getProfile(req.clientAuth!)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const updatePortalProfile = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.updateProfile(req.clientAuth!, req.body)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}

export const changePortalPassword = async (req: Request, res: Response) => {
  try { res.json(await clientPortalService.changePassword(req.clientAuth!, req.body)) }
  catch (err: any) { res.status(400).json({ error: err.message }) }
}
