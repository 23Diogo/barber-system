import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { Request, Response } from 'express'
import { authService } from './auth.service'
import { supabaseAdmin } from '../../config/supabase'
import { sendPasswordResetOwner } from '../../services/email.service'

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
    res.status(400).json({ error: err.message })
  }
}

// ─── Recuperação de senha ─────────────────────────────────────────────────────

export const forgotPassword = async (req: Request, res: Response) => {
  // Sempre retorna 200 para não revelar se o e-mail existe
  const ok = { ok: true, message: 'Se o e-mail estiver cadastrado, você receberá as instruções em breve.' }

  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    if (!email) return res.json(ok)

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, name, email, barbershop_id, barbershops(name)')
      .ilike('email', email)
      .eq('is_active', true)
      .maybeSingle()

    if (!user) return res.json(ok)

    // Gera token seguro
    const rawToken  = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hora

    // Invalida tokens anteriores do mesmo usuário
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('used_at', null)

    // Insere novo token
    await supabaseAdmin.from('password_reset_tokens').insert({
      user_id:    user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })

    const shopName = (user.barbershops as any)?.name || 'BarberFlow'

    // Dispara e-mail
    setImmediate(() => {
      sendPasswordResetOwner({
        email:      user.email,
        ownerName:  user.name,
        resetToken: rawToken,
      }).catch(err => console.error('❌ [email] sendPasswordResetOwner:', err?.message))
    })

    res.json(ok)
  } catch (err: any) {
    console.error('forgotPassword error:', err?.message)
    res.json(ok) // nunca expõe erro ao cliente
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' })
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' })
    }

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex')

    const { data: tokenRow } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (!tokenRow) {
      return res.status(400).json({ error: 'Token inválido ou expirado.' })
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10)

    await supabaseAdmin
      .from('users')
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq('id', tokenRow.user_id)

    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)

    res.json({ ok: true, message: 'Senha redefinida com sucesso.' })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
}
