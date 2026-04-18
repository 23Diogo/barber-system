import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../../config/supabase'
import { AuthPayload } from '../../middleware/auth'

export const authService = {
  async register(data: {
    barbershopName: string
    ownerName: string
    email: string
    phone: string
    password: string
  }) {
    const trialEnd = new Date()
    trialEnd.setDate(trialEnd.getDate() + 14)

    const normalizedEmail = data.email.trim().toLowerCase()

    // Verifica se e-mail já existe
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (existing) {
      throw new Error('Este e-mail já está cadastrado.')
    }

    const slug = data.barbershopName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    const passwordHash = await bcrypt.hash(data.password, 10)

    const { data: shop, error: shopErr } = await supabaseAdmin
      .from('barbershops')
      .insert({
        name: data.barbershopName,
        slug,
        owner_name: data.ownerName,
        email: normalizedEmail,
        phone: data.phone,
        plan_status: 'trial',
        trial_ends_at: trialEnd.toISOString(),
        is_active: true,
      })
      .select()
      .single()

    if (shopErr) {
      console.error('AUTH register shop error:', shopErr)
      throw new Error(shopErr.message)
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .insert({
        barbershop_id: shop.id,
        name: data.ownerName,
        email: normalizedEmail,
        phone: data.phone,
        role: 'owner',
        password_hash: passwordHash,
      })
      .select()
      .single()

    if (userErr) {
      console.error('AUTH register user error:', userErr)
      throw new Error(userErr.message)
    }

    const token = jwt.sign(
      { userId: user.id, barbershopId: shop.id, role: 'owner' } as AuthPayload,
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return { token, user, barbershop: shop }
  },

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase()

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('*, barbershops(*)')
      .ilike('email', normalizedEmail)
      .eq('is_active', true)
      .maybeSingle()

    if (userErr) {
      console.error('AUTH login user error:', userErr)
      throw new Error('Erro ao buscar usuário.')
    }

    if (!user) {
      throw new Error('E-mail ou senha incorretos.')
    }

    // Usuários sem senha (migração) — bloqueia e pede redefinição
    if (!user.password_hash) {
      throw new Error('Conta sem senha definida. Entre em contato com o suporte.')
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash)

    if (!passwordMatch) {
      throw new Error('E-mail ou senha incorretos.')
    }

    const shop = user.barbershops

    if (!shop?.is_active) {
      throw new Error('Barbearia inativa. Entre em contato com o suporte.')
    }

    const token = jwt.sign(
      { userId: user.id, barbershopId: shop.id, role: user.role } as AuthPayload,
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      barbershop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        plan_status: shop.plan_status,
      },
    }
  },
}
