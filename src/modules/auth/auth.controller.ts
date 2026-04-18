import { Request, Response } from 'express'
import { authService } from './auth.service'
import { supabaseAdmin } from '../../config/supabase'

export const register = async (req: Request, res: Response) => {
  try {
    const { barbershopName, ownerName, email, phone, password } = req.body

    if (!barbershopName || !ownerName || !email || !phone || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' })
    }

    res.status(201).json(await authService.register({ barbershopName, ownerName, email, phone, password }))
  } catch (err: any) {
    console.error('AUTH register controller error:', err)
    res.status(400).json({ error: err.message })
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
    }

    res.json(await authService.login(email, password))
  } catch (err: any) {
    console.error('AUTH login controller error:', err)
    res.status(401).json({ error: err.message })
  }
}

export const me = async (req: Request, res: Response) => {
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role, barbershops(*)')
      .eq('id', req.user!.userId)
      .single()

    res.json(data)
  } catch (err: any) {
    console.error('AUTH me controller error:', err)
    res.status(400).json({ error: err.message })
  }
}
