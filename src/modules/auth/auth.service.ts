import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../../config/supabase'
import { AuthPayload } from '../../middleware/auth'

export const authService = {
  async register(data: { barbershopName: string; ownerName: string; email: string; phone: string }) {
    const trialEnd = new Date()
    trialEnd.setDate(trialEnd.getDate() + 14)

    const normalizedEmail = data.email.trim().toLowerCase()

    const slug = data.barbershopName.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

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
        is_active: true
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
        role: 'owner'
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

  async login(email: string) {
    const normalizedEmail = email.trim().toLowerCase()
    console.log('AUTH login attempt:', normalizedEmail)

    const { data: shop, error: shopErr } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, is_active, plan_status, email')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (shopErr) {
      console.error('AUTH login shop error:', shopErr)
      throw new Error(`Erro ao buscar barbearia: ${shopErr.message}`)
    }

    console.log('AUTH login shop result:', shop)

    if (!shop) {
      throw new Error('Credenciais inválidas')
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('barbershop_id', shop.id)
      .ilike('email', normalizedEmail)
      .eq('is_active', true)
      .maybeSingle()

    if (userErr) {
      console.error('AUTH login user error:', userErr)
      throw new Error(`Erro ao buscar usuário: ${userErr.message}`)
    }

    console.log('AUTH login user result:', user)

    if (!user) {
      throw new Error('Credenciais inválidas')
    }

    const token = jwt.sign(
      { userId: user.id, barbershopId: shop.id, role: user.role } as AuthPayload,
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return { token, user, barbershop: shop }
  }
}
