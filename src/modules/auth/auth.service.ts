import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../../config/supabase'
import { AuthPayload } from '../../middleware/auth'
import { sendWelcomeOwner } from '../../services/email.service'
import { createMercadoPagoPreference } from '../mercadopago/mercadopago.service'

export const authService = {
  async register(data: {
    barbershopName: string
    ownerName: string
    email: string
    phone: string
    password: string
  }) {
    const normalizedEmail = data.email.trim().toLowerCase()

    // Verifica e-mail duplicado
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle()
    if (existing) throw new Error('Este e-mail já está cadastrado.')

    // Gera slug da barbearia
    const slug = data.barbershopName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    const passwordHash = await bcrypt.hash(data.password, 10)

    // Cria a barbearia (sem trial — sistema requer assinatura ativa)
    const { data: shop, error: shopErr } = await supabaseAdmin
      .from('barbershops')
      .insert({
        name:        data.barbershopName,
        slug,
        owner_name:  data.ownerName,
        email:       normalizedEmail,
        phone:       data.phone,
        plan_status: 'suspended',
        is_active:   true,
      })
      .select()
      .single()
    if (shopErr) throw new Error(shopErr.message)

    // Cria usuário dono
    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .insert({
        barbershop_id: shop.id,
        name:          data.ownerName,
        email:         normalizedEmail,
        phone:         data.phone,
        role:          'owner',
        password_hash: passwordHash,
      })
      .select()
      .single()
    if (userErr) throw new Error(userErr.message)

    // Cria licença da plataforma como suspensa
    const { error: licenseErr } = await supabaseAdmin
      .from('barbershop_licenses')
      .insert({
        barbershop_id: shop.id,
        status:        'suspended',
        amount:        89.90,
        grace_days:    5,
      })
    if (licenseErr) {
      console.error('❌ [register] Erro ao criar licença:', licenseErr.message)
    }

    // Gera link de pagamento da licença no Mercado Pago
    let paymentUrl: string | null = null
    try {
      const preference = await createMercadoPagoPreference({
        title:             'BarberFlow — Assinatura Mensal',
        quantity:          1,
        unitPrice:         89.90,
        externalReference: `license_${shop.id}`,
        payerEmail:        normalizedEmail,
        successUrl:        'https://bbarberflow.com.br/app/assinatura/sucesso',
        failureUrl:        'https://bbarberflow.com.br/app/assinatura/falha',
        pendingUrl:        'https://bbarberflow.com.br/app/assinatura/pendente',
      })
      paymentUrl = preference.init_point
    } catch (mpErr: any) {
      console.error('❌ [register] Erro ao gerar link de pagamento:', mpErr.message)
    }

    // JWT
    const token = jwt.sign(
      { userId: user.id, barbershopId: shop.id, role: 'owner' } as AuthPayload,
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    // E-mail de boas-vindas — não bloqueia o cadastro se falhar
    setImmediate(() => {
      sendWelcomeOwner({
        email:     normalizedEmail,
        ownerName: data.ownerName,
        shopName:  data.barbershopName,
      }).catch(err => console.error('❌ [email] sendWelcomeOwner:', err?.message))
    })

    return {
      token,
      user,
      barbershop:  shop,
      paymentUrl,           // Frontend redireciona para cá após cadastro
      licenseStatus: 'suspended',
    }
  },

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase()

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('*, barbershops(*)')
      .ilike('email', normalizedEmail)
      .eq('is_active', true)
      .maybeSingle()

    if (userErr) throw new Error('Erro ao buscar usuário.')
    if (!user)   throw new Error('E-mail ou senha incorretos.')
    if (!user.password_hash) {
      throw new Error('Conta sem senha definida. Entre em contato com o suporte.')
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash)
    if (!passwordMatch) throw new Error('E-mail ou senha incorretos.')

    const shop = user.barbershops
    if (!shop?.is_active) throw new Error('Barbearia inativa. Entre em contato com o suporte.')

    // Busca status da licença da plataforma
    const { data: license } = await supabaseAdmin
      .from('barbershop_licenses')
      .select('status, current_period_end')
      .eq('barbershop_id', shop.id)
      .maybeSingle()

    const token = jwt.sign(
      { userId: user.id, barbershopId: shop.id, role: user.role } as AuthPayload,
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )

    return {
      token,
      user:       { id: user.id, name: user.name, email: user.email, role: user.role },
      barbershop: { id: shop.id, name: shop.name, slug: shop.slug, plan_status: shop.plan_status },
      license:    {
        status:             license?.status ?? 'suspended',
        current_period_end: license?.current_period_end ?? null,
      },
    }
  },

  // Gera novo link de pagamento para barbearia existente (reativação)
  async generatePaymentLink(barbershopId: string, email: string) {
    try {
      const preference = await createMercadoPagoPreference({
        title:             'BarberFlow — Assinatura Mensal',
        quantity:          1,
        unitPrice:         89.90,
        externalReference: `license_${barbershopId}`,
        payerEmail:        email,
        successUrl:        'https://bbarberflow.com.br/app/assinatura/sucesso',
        failureUrl:        'https://bbarberflow.com.br/app/assinatura/falha',
        pendingUrl:        'https://bbarberflow.com.br/app/assinatura/pendente',
      })
      return { paymentUrl: preference.init_point }
    } catch (err: any) {
      throw new Error(`Erro ao gerar link de pagamento: ${err.message}`)
    }
  },
}
