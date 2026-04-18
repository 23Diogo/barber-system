import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import * as bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../../config/supabase'
import { ClientAuthPayload } from '../../middleware/client-auth'

type RegisterClientInput = {
  name: string
  whatsapp?: string | null
  email?: string | null
  password: string
  barbershopSlug: string
}

type LoginClientInput = {
  identifier: string
  password: string
  barbershopSlug: string
}

type ForgotPasswordInput = {
  identifier: string
  barbershopSlug: string
}

type ResetPasswordInput = {
  token: string
  newPassword: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeEmail(value?: string | null) {
  const email = String(value || '').trim().toLowerCase()
  return email || null
}

function normalizeWhatsapp(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits || null
}

function isEmailIdentifier(value: string) {
  return value.includes('@')
}

function signClientToken(payload: ClientAuthPayload) {
  return jwt.sign(payload, process.env.CLIENT_JWT_SECRET!, { expiresIn: '7d' })
}

function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// ─── Busca barbearia pelo slug ───────────────────────────────────────────────

async function getBarbershopBySlug(slug: string) {
  const normalizedSlug = String(slug || '').trim().toLowerCase()

  if (!normalizedSlug) {
    throw new Error('Slug da barbearia não informado')
  }

  const { data, error } = await supabaseAdmin
    .from('barbershops')
    .select('id, name, slug, is_active')
    .eq('slug', normalizedSlug)
    .single()

  if (error || !data) {
    throw new Error('Barbearia não encontrada')
  }

  if (!data.is_active) {
    throw new Error('Barbearia indisponível no momento')
  }

  return data
}

// ─── Queries internas ────────────────────────────────────────────────────────

async function findClientByEmail(barbershopId: string, email: string) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .ilike('email', email)
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0] || null
}

async function findClientByWhatsapp(barbershopId: string, whatsapp: string) {
  const byWhatsapp = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .eq('whatsapp', whatsapp)
    .limit(1)

  if (byWhatsapp.error) throw new Error(byWhatsapp.error.message)
  if (byWhatsapp.data?.[0]) return byWhatsapp.data[0]

  const byPhone = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .eq('phone', whatsapp)
    .limit(1)

  if (byPhone.error) throw new Error(byPhone.error.message)
  return byPhone.data?.[0] || null
}

async function findExistingClient(
  barbershopId: string,
  email: string | null,
  whatsapp: string | null
) {
  if (email) {
    const clientByEmail = await findClientByEmail(barbershopId, email)
    if (clientByEmail) return clientByEmail
  }

  if (whatsapp) {
    const clientByWhatsapp = await findClientByWhatsapp(barbershopId, whatsapp)
    if (clientByWhatsapp) return clientByWhatsapp
  }

  return null
}

async function findAccountByIdentifier(barbershopId: string, identifier: string) {
  const normalizedEmail = normalizeEmail(identifier)
  const normalizedWhatsapp = normalizeWhatsapp(identifier)

  if (isEmailIdentifier(identifier) && normalizedEmail) {
    const { data, error } = await supabaseAdmin
      .from('client_accounts')
      .select('*')
      .eq('barbershop_id', barbershopId)
      .ilike('email', normalizedEmail)
      .eq('is_active', true)
      .limit(1)

    if (error) throw new Error(error.message)
    return data?.[0] || null
  }

  if (normalizedWhatsapp) {
    const { data, error } = await supabaseAdmin
      .from('client_accounts')
      .select('*')
      .eq('barbershop_id', barbershopId)
      .eq('whatsapp', normalizedWhatsapp)
      .eq('is_active', true)
      .limit(1)

    if (error) throw new Error(error.message)
    return data?.[0] || null
  }

  return null
}

async function getClientById(clientId: string, barbershopId: string) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select(
      'id, barbershop_id, name, email, phone, whatsapp, notes, is_active, is_vip, created_at, updated_at'
    )
    .eq('id', clientId)
    .eq('barbershop_id', barbershopId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const clientAuthService = {
  async register(input: RegisterClientInput) {
    const barbershop = await getBarbershopBySlug(input.barbershopSlug)
    const barbershopId = barbershop.id

    const name = String(input.name || '').trim()
    const email = normalizeEmail(input.email)
    const whatsapp = normalizeWhatsapp(input.whatsapp)
    const password = String(input.password || '')

    if (!name) throw new Error('Nome é obrigatório')
    if (!whatsapp && !email) throw new Error('Informe WhatsApp ou e-mail')
    if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres')

    const existingAccountByEmail = email
      ? await findAccountByIdentifier(barbershopId, email)
      : null

    if (existingAccountByEmail) {
      throw new Error('Já existe uma conta com este e-mail')
    }

    const existingAccountByWhatsapp = whatsapp
      ? await findAccountByIdentifier(barbershopId, whatsapp)
      : null

    if (existingAccountByWhatsapp) {
      throw new Error('Já existe uma conta com este WhatsApp')
    }

    let client = await findExistingClient(barbershopId, email, whatsapp)

    if (client && client.is_active === false) {
      throw new Error('Cliente inativo. Procure a barbearia para reativar seu cadastro')
    }

    if (!client) {
      const { data: createdClient, error: clientError } = await supabaseAdmin
        .from('clients')
        .insert({
          barbershop_id: barbershopId,
          name,
          email,
          phone: whatsapp,
          whatsapp,
          is_active: true,
        })
        .select()
        .single()

      if (clientError) throw new Error(clientError.message)
      client = createdClient
    } else {
      const { data: updatedClient, error: updateClientError } = await supabaseAdmin
        .from('clients')
        .update({
          name: client.name || name,
          email: client.email || email,
          phone: client.phone || whatsapp,
          whatsapp: client.whatsapp || whatsapp,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id)
        .eq('barbershop_id', barbershopId)
        .select()
        .single()

      if (updateClientError) throw new Error(updateClientError.message)
      client = updatedClient
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const { data: account, error: accountError } = await supabaseAdmin
      .from('client_accounts')
      .insert({
        client_id: client.id,
        barbershop_id: barbershopId,
        email,
        whatsapp,
        password_hash: passwordHash,
        is_active: true,
      })
      .select()
      .single()

    if (accountError) throw new Error(accountError.message)

    const token = signClientToken({
      clientId: client.id,
      clientAccountId: account.id,
      barbershopId,
      role: 'client',
    })

    return {
      token,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        whatsapp: client.whatsapp,
        barbershopId,
        barbershopSlug: barbershop.slug,
      },
    }
  },

  async login(input: LoginClientInput) {
    const barbershop = await getBarbershopBySlug(input.barbershopSlug)
    const barbershopId = barbershop.id

    const identifier = String(input.identifier || '').trim()
    const password = String(input.password || '')

    if (!identifier || !password) {
      throw new Error('Credenciais inválidas')
    }

    const account = await findAccountByIdentifier(barbershopId, identifier)
    if (!account || !account.is_active) {
      throw new Error('Credenciais inválidas')
    }

    const passwordMatches = await bcrypt.compare(password, account.password_hash)
    if (!passwordMatches) {
      throw new Error('Credenciais inválidas')
    }

    const client = await getClientById(account.client_id, barbershopId)
    if (!client || client.is_active === false) {
      throw new Error('Conta indisponível')
    }

    await supabaseAdmin
      .from('client_accounts')
      .update({
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id)
      .eq('barbershop_id', barbershopId)

    const token = signClientToken({
      clientId: client.id,
      clientAccountId: account.id,
      barbershopId,
      role: 'client',
    })

    return {
      token,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        whatsapp: client.whatsapp,
        barbershopId,
        barbershopSlug: barbershop.slug,
      },
    }
  },

  async me(auth: ClientAuthPayload) {
    const { data: account, error: accountError } = await supabaseAdmin
      .from('client_accounts')
      .select(
        'id, client_id, barbershop_id, email, whatsapp, is_active, last_login_at, created_at'
      )
      .eq('id', auth.clientAccountId)
      .eq('client_id', auth.clientId)
      .eq('barbershop_id', auth.barbershopId)
      .eq('is_active', true)
      .single()

    if (accountError) throw new Error(accountError.message)

    const client = await getClientById(auth.clientId, auth.barbershopId)

    return {
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        whatsapp: client.whatsapp,
        notes: client.notes,
        isActive: client.is_active,
        isVip: client.is_vip,
        barbershopId: client.barbershop_id,
      },
      account,
    }
  },

  async forgotPassword(input: ForgotPasswordInput) {
    const identifier = String(input.identifier || '').trim()

    if (!identifier) {
      return {
        ok: true,
        message: 'Se os dados estiverem corretos, você receberá instruções para redefinir sua senha.',
      }
    }

    let barbershopId: string

    try {
      const barbershop = await getBarbershopBySlug(input.barbershopSlug)
      barbershopId = barbershop.id
    } catch {
      return {
        ok: true,
        message: 'Se os dados estiverem corretos, você receberá instruções para redefinir sua senha.',
      }
    }

    const account = await findAccountByIdentifier(barbershopId, identifier)

    if (!account) {
      return {
        ok: true,
        message: 'Se os dados estiverem corretos, você receberá instruções para redefinir sua senha.',
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashResetToken(rawToken)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

    const { error } = await supabaseAdmin
      .from('client_password_reset_tokens')
      .insert({
        client_account_id: account.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })

    if (error) throw new Error(error.message)

    return {
      ok: true,
      message: 'Se os dados estiverem corretos, você receberá instruções para redefinir sua senha.',
      ...(process.env.ALLOW_CLIENT_RESET_DEBUG === 'true'
        ? { debugResetToken: rawToken }
        : {}),
    }
  },

  async resetPassword(input: ResetPasswordInput) {
    const token = String(input.token || '').trim()
    const newPassword = String(input.newPassword || '')

    if (!token) throw new Error('Token inválido')
    if (newPassword.length < 6) {
      throw new Error('A nova senha deve ter pelo menos 6 caracteres')
    }

    const tokenHash = hashResetToken(token)

    const { data: tokenRows, error: tokenError } = await supabaseAdmin
      .from('client_password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)

    if (tokenError) throw new Error(tokenError.message)

    const tokenRow = tokenRows?.[0]
    if (!tokenRow) {
      throw new Error('Token inválido ou expirado')
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    const { error: updateAccountError } = await supabaseAdmin
      .from('client_accounts')
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tokenRow.client_account_id)

    if (updateAccountError) throw new Error(updateAccountError.message)

    const { error: markUsedError } = await supabaseAdmin
      .from('client_password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)

    if (markUsedError) throw new Error(markUsedError.message)

    return {
      ok: true,
      message: 'Senha redefinida com sucesso.',
    }
  },
}
