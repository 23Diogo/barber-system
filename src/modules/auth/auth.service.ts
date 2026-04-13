import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../../config/supabase'
import { AuthPayload } from '../../middleware/auth'

export const authService = {

  async register(data: { barbershopName: string; ownerName: string; email: string; phone: string }) {
    const trialEnd = new Date()
    trialEnd.setDate(trialEnd.getDate() + 14)

    const slug = data.barbershopName.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    const { data: shop, error: shopErr } = await supabaseAdmin
      .from('barbershops')
      .insert({ name: data.barbershopName, slug, owner_name: data.ownerName, email: data.email, phone: data.phone, plan_status: 'trial', trial_ends_at: trialEnd.toISOString(), is_active: true })
      .select().single()

    if (shopErr) throw new Error(shopErr.message)

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .insert({ barbershop_id: shop.id, name: data.ownerName, email: data.email, phone: data.phone, role: 'owner' })
      .select().single()

    if (userErr) throw new Error(userErr.message)

    const token = jwt.sign(
      { userId: user.id, barbershopId: shop.id, role: 'owner' } as AuthPayload,
      process.env.JWT_SECRET!, { expiresIn: '7d' }
    )

    return { token, user, barbershop: shop }
  },

  async login(email: string) {
    const { data: shop } = await supabaseAdmin
      .from('barbershops').select('id, name, is_active, plan_status').eq('email', email).maybeSingle()

    if (!shop) throw new Error('Credenciais inválidas')

    const { data: user } = await supabaseAdmin
      .from('users').select('*').eq('barbershop_id', shop.id).eq('email', email).eq('is_active', true).maybeSingle()

    if (!user) throw new Error('Credenciais inválidas')

    const token = jwt.sign(
      { userId: user.id, barbershopId: shop.id, role: user.role } as AuthPayload,
      process.env.JWT_SECRET!, { expiresIn: '7d' }
    )

    return { token, user, barbershop: shop }
  }
}
