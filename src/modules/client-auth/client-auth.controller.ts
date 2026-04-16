import { Request, Response } from 'express'
import { clientAuthService } from './client-auth.service'

export const registerClient = async (req: Request, res: Response) => {
  try {
    const data = await clientAuthService.register(req.body)
    res.status(201).json(data)
  } catch (err: any) {
    console.error('CLIENT AUTH register controller error:', err)
    res.status(400).json({ error: err.message })
  }
}

export const loginClient = async (req: Request, res: Response) => {
  try {
    const data = await clientAuthService.login(req.body)
    res.json(data)
  } catch (err: any) {
    console.error('CLIENT AUTH login controller error:', err)
    res.status(401).json({ error: err.message })
  }
}

export const meClient = async (req: Request, res: Response) => {
  try {
    const data = await clientAuthService.me(req.clientAuth!)
    res.json(data)
  } catch (err: any) {
    console.error('CLIENT AUTH me controller error:', err)
    res.status(400).json({ error: err.message })
  }
}

export const forgotPasswordClient = async (req: Request, res: Response) => {
  try {
    const data = await clientAuthService.forgotPassword(req.body)
    res.json(data)
  } catch (err: any) {
    console.error('CLIENT AUTH forgot-password controller error:', err)
    res.status(400).json({ error: err.message })
  }
}

export const resetPasswordClient = async (req: Request, res: Response) => {
  try {
    const data = await clientAuthService.resetPassword(req.body)
    res.json(data)
  } catch (err: any) {
    console.error('CLIENT AUTH reset-password controller error:', err)
    res.status(400).json({ error: err.message })
  }
}
