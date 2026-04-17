import { Request, Response } from 'express'
import { clientPortalService } from './client-portal.service'

export const getPortalContext = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.getContext(req.clientAuth!)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const listPortalServices = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.listServices(req.clientAuth!)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const listPortalBarbers = async (req: Request, res: Response) => {
  try {
    const serviceId = String(req.query.serviceId || '').trim()
    const data = await clientPortalService.listBarbers(req.clientAuth!, { serviceId })
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const listPortalAvailableSlots = async (req: Request, res: Response) => {
  try {
    const barberId = String(req.query.barberId || '').trim()
    const serviceId = String(req.query.serviceId || '').trim()
    const date = String(req.query.date || '').trim()

    const data = await clientPortalService.getAvailableSlots(req.clientAuth!, {
      barberId,
      serviceId,
      date,
    })

    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const createPortalAppointment = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.createAppointment(req.clientAuth!, req.body)
    res.status(201).json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const listPortalAppointments = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.listAppointments(req.clientAuth!)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const cancelPortalAppointment = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.cancelAppointment(
      req.clientAuth!,
      req.params.id,
      req.body?.reason
    )
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const listPortalPlans = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.listPlans(req.clientAuth!)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const getPortalSubscription = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.getSubscription(req.clientAuth!)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const createPortalSubscriptionCheckout = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.createSubscriptionCheckout(req.clientAuth!, req.body)
    res.status(201).json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const cancelPortalPendingSubscription = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.cancelPendingSubscription(req.clientAuth!, req.body)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const getPortalProfile = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.getProfile(req.clientAuth!)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const updatePortalProfile = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.updateProfile(req.clientAuth!, req.body)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}

export const changePortalPassword = async (req: Request, res: Response) => {
  try {
    const data = await clientPortalService.changePassword(req.clientAuth!, req.body)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}
