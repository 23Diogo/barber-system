import { Request, Response } from 'express'
import { authService } from './auth.service'
import { supabaseAdmin } from '../../config/supabase'

export const register = async (req: Request, res: Response) => {
  try {
    res.status(201).json(await authService.register(req.body))
  } catch (err: any) {
    console.error('AUTH register controller error:', err)
    res.status(400).json({ error: err.message })
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    res.json(await authService.login(req.body.email))
  } catch (err: any) {
    console.error('AUTH login controller error:', err)
    res.status(401).json({ error: err.message })
  }
}

export const me = async (req: Request, res: Response) => {
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('*, barbershops(*)')
      .eq('id', req.user!.userId)
      .single()

    res.json(data)
  } catch (err: any) {
    console.error('AUTH me controller error:', err)
    res.status(400).json({ error: err.message })
  }
}
