import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import * as bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../../config/supabase'
import { ClientAuthPayload } from '../../middleware/client-auth'
import { sendWelcomeClient, sendPasswordResetClient } from '../../services/email.service'
import { whatsappService } from '../whatsapp/whatsapp.service'

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
  barbershopSlug?: string | null
}

type ForgotPasswordInput = {
  identifier: string
  barbershopSlug?: string | null
}

type ResetPasswordInput = {
  token: string
  newPassword: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Busca barbearia ──────────────────────────────────────────────────────────

async function getBarbershopBySlug(slug: string) {
  const normalizedSlug = String(slug || '').trim().toLowerCase()
  if (!normalizedSlug) throw new Error('Slug da barbearia não informado')

  const { data, error } = await supabaseAdmin
    .from('barbershops')
    .select('id, name, slug, is_active')
    .eq('slug', normalizedSlug)
    .single()

  if (error || !data) throw new Error('Barbearia não encontrada')
  if (!data.is_active) throw new Error('Barbearia indisponível no momento')
  return data
}

async function getBarbershopById(barbershopId: string) {
  const id = String(barbershopId || '').trim()
  if (!id) throw new Error('Barbearia não encontrada')

  const { data, error } = await supabaseAdmin
    .from('barbershops')
    .select('id, name, slug, is_active')
    .eq('id', id)
    .single()

  if (error || !data) throw new Error('Barbearia não encontrada')
  if (!data.is_active) throw new Error('Barbearia indisponível no momento')
  return data
}

// ─── Queries internas ─────────────────────────────────────────────────────────

async function findAccountByEmail(barbershopId: string, email: string) {
  const { data, error } = await supabaseAdmin
    .from('client_accounts')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .ilike('email', email)
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0] || null
}

async function findAccountByWhatsapp(barbershopId: string, whatsapp: string) {
  const { data, error } = await supabaseAdmin
    .from('client_accounts')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .eq('whatsapp', whatsapp)
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0] || null
}

async function findAccountByEmailGlobal(email: string) {
  const { data, error } = await supabaseAdmin
    .from('client_accounts')
    .select('*')
    .ilike('email', email)
    .eq('is_active', true)
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0] || null
}

async function findAccountByWhatsappGlobal(whatsapp: string) {
  const { data, error } = await supabaseAdmin
    .from('client_accounts')
    .select('*')
    .eq('whatsapp', whatsapp)
    .eq('is_active', true)
    .limit(1)

  if (error) throw new Error(error.message)
  return data?.[0] || null
}

async function findAccountsByIdentifierGlobal(identifier: string) {
  const normalizedEmail = normalizeEmail(identifier)
  const normalizedWhatsapp = normalizeWhatsapp(identifier)

  if (isEmailIdentifier(identifier) && normalizedEmail) {
    const { data, error } = await supabaseAdmin
      .from('client_accounts')
      .select('*')
      .ilike('email', normalizedEmail)
      .eq('is_active', true)
      .order('last_login_at', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)
    return data || []
  }

  if (normalizedWhatsapp) {
    const { data, error } = await supabaseAdmin
      .from('client_accounts')
      .select('*')
      .eq('whatsapp', normalizedWhatsapp)
      .eq('is_active', true)
      .order('last_login_at', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)
    return data || []
  }

  return []
}

async function findAccountByIdentifier(barbershopId: string, identifier: string) {
  const normalizedEmail = normalizeEmail(identifier)
  const normalizedWhatsapp = normalizeWhatsapp(identifier)

  if (isEmailIdentifier(identifier) && normalizedEmail) {
    return await findAccountByEmail(barbershopId, normalizedEmail)
  }

  if (normalizedWhatsapp) {
    return await findAccountByWhatsapp(barbershopId, normalizedWhatsapp)
  }

  return null
}

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
  const byWa = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .eq('whatsapp', whatsapp)
    .limit(1)

  if (byWa.error) throw new Error(byWa.error.message)
  if (byWa.data?.[0]) return byWa.data[0]

  const byPhone = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('barbershop_id', barbershopId)
    .eq('phone', whatsapp)
    .limit(1)

  if (byPhone.error) throw new Error(byPhone.error.message)
  return byPhone.data?.[0] || null
}

async function findExistingClient(barbershopId: string, email: string | null, whatsapp: string | null) {
  if (email) {
    const c = await findClientByEmail(barbershopId, email)
    if (c) return c
  }

  if (whatsapp) {
    const c = await findClientByWhatsapp(barbershopId, whatsapp)
    if (c) return c
  }

  return null
}

async function getClientById(clientId: string, barbershopId: string) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, barbershop_id, name, email, phone, whatsapp, notes, is_active, is_vip, created_at, updated_at')
    .eq('id', clientId)
    .eq('barbershop_id', barbershopId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

async function getLinkedBarbershopsByAccount(account: any, selectedBarbershopId?: string) {
  const identifier = account?.email || account?.whatsapp
  if (!identifier) return []

  const field = account?.email ? 'email' : 'whatsapp'

  let query = supabaseAdmin
    .from('client_accounts')
    .select('barbershop_id, barbershops(id, name, slug, is_active)')
    .eq('is_active', true)

  query =
    field === 'email'
      ? query.ilike('email', identifier)
      : query.eq('whatsapp', identifier)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const map = new Map<string, any>()

  for (const row of data || []) {
    const relation = (row as any).barbershops
    const shop = Array.isArray(relation) ? relation[0] : relation
    if (!shop?.id) continue

    map.set(shop.id, {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      is_active: shop.is_active,
      is_selected: shop.id === selectedBarbershopId,
    })
  }

  return Array.from(map.values())
}

async function ensureLinkedClientAccountToBarbershop(params: {
  sourceAccount: any
  targetBarbershop: any
  identifier: string
}) {
  const { sourceAccount, targetBarbershop, identifier } = params

  const sourceClient = await getClientById(sourceAccount.client_id, sourceAccount.barbershop_id)

  const email =
    normalizeEmail(sourceAccount.email) ||
    normalizeEmail(sourceClient.email) ||
    normalizeEmail(identifier)

  const whatsapp =
    normalizeWhatsapp(sourceAccount.whatsapp) ||
    normalizeWhatsapp(sourceClient.whatsapp) ||
    normalizeWhatsapp(sourceClient.phone) ||
    normalizeWhatsapp(identifier)

  let targetClient = await findExistingClient(targetBarbershop.id, email, whatsapp)

  if (targetClient?.is_active === false) {
    throw new Error('Conta indisponível')
  }

  if (!targetClient) {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .insert({
        barbershop_id: targetBarbershop.id,
        name: sourceClient.name,
        email: email || sourceClient.email,
        phone: whatsapp || sourceClient.phone,
        whatsapp: whatsapp || sourceClient.whatsapp,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    targetClient = data
  }

  const existingTargetAccount =
    (email && await findAccountByEmail(targetBarbershop.id, email)) ||
    (whatsapp && await findAccountByWhatsapp(targetBarbershop.id, whatsapp))

  if (existingTargetAccount?.is_active === false) {
    throw new Error('Conta indisponível')
  }

  if (existingTargetAccount) {
    const linkedClient = await getClientById(existingTargetAccount.client_id, targetBarbershop.id)
    return {
      account: existingTargetAccount,
      client: linkedClient,
    }
  }

  const { data: account, error: accountError } = await supabaseAdmin
    .from('client_accounts')
    .insert({
      client_id: targetClient.id,
      barbershop_id: targetBarbershop.id,
      email,
      whatsapp,
      password_hash: sourceAccount.password_hash,
      is_active: true,
    })
    .select()
    .single()

  if (accountError) throw new Error(accountError.message)

  return {
    account,
    client: targetClient,
  }
}

// ─── Helper: dispara WhatsApp de boas-vindas de forma assíncrona ──────────────

function fireWelcomeWhatsApp(barbershopId: string, clientName: string, clientWhatsapp: string | null) {
  setImmediate(() => {
    if (clientWhatsapp) {
      whatsappService.sendClientWelcome({ barbershopId, clientName, clientWhatsapp })
        .catch(err => console.error('❌ [WA] sendClientWelcome:', err?.message))
    }

    whatsappService.sendOwnerNewClientAlert({ barbershopId, clientName, clientWhatsapp })
      .catch(err => console.error('❌ [WA] sendOwnerNewClientAlert:', err?.message))
  })
}

// ─── Service ──────────────────────────────────────────────────────────────────

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

    const existingInThisShop =
      (email && await findAccountByEmail(barbershopId, email)) ||
      (whatsapp && await findAccountByWhatsapp(barbershopId, whatsapp))

    if (existingInThisShop) {
      throw new Error('Você já tem uma conta nesta barbearia. Use a tela de login.')
    }

    const existingGlobal =
      (email && await findAccountByEmailGlobal(email)) ||
      (whatsapp && await findAccountByWhatsappGlobal(whatsapp))

    if (existingGlobal) {
      const passwordMatches = await bcrypt.compare(password, existingGlobal.password_hash)
      if (!passwordMatches) {
        throw new Error(
          'Este e-mail já está cadastrado em outra barbearia. Use a mesma senha para criar um vínculo com esta barbearia.'
        )
      }

      let client = await findExistingClient(barbershopId, email, whatsapp)

      if (!client) {
        const { data: originalClient } = await supabaseAdmin
          .from('clients')
          .select('name, email, phone, whatsapp')
          .eq('id', existingGlobal.client_id)
          .single()

        const { data, error } = await supabaseAdmin
          .from('clients')
          .insert({
            barbershop_id: barbershopId,
            name: name || originalClient?.name,
            email: email || originalClient?.email,
            phone: whatsapp || originalClient?.phone,
            whatsapp: whatsapp || originalClient?.whatsapp,
            is_active: true,
          })
          .select()
          .single()

        if (error) throw new Error(error.message)
        client = data
      }

      const { data: account, error: accountError } = await supabaseAdmin
        .from('client_accounts')
        .insert({
          client_id: client.id,
          barbershop_id: barbershopId,
          email,
          whatsapp,
          password_hash: existingGlobal.password_hash,
          is_active: true,
        })
        .select()
        .single()

      if (accountError) throw new Error(accountError.message)

      const linkedBarbershops = await getLinkedBarbershopsByAccount(account, barbershopId)

      const token = signClientToken({
        clientId: client.id,
        clientAccountId: account.id,
        barbershopId,
        role: 'client',
      })

      fireWelcomeWhatsApp(barbershopId, client.name, whatsapp)

      return {
        token,
        isNewBarbershopLink: true,
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          whatsapp: client.whatsapp,
          barbershopId,
          barbershopSlug: barbershop.slug,
          barbershops: linkedBarbershops,
        },
      }
    }

    let client = await findExistingClient(barbershopId, email, whatsapp)

    if (client?.is_active === false) {
      throw new Error('Cliente inativo. Procure a barbearia para reativar seu cadastro')
    }

    if (!client) {
      const { data, error } = await supabaseAdmin
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

      if (error) throw new Error(error.message)
      client = data
    } else {
      const { data, error } = await supabaseAdmin
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

      if (error) throw new Error(error.message)
      client = data
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

    const linkedBarbershops = await getLinkedBarbershopsByAccount(account, barbershopId)

    const token = signClientToken({
      clientId: client.id,
      clientAccountId: account.id,
      barbershopId,
      role: 'client',
    })

    if (email) {
      setImmediate(() => {
        sendWelcomeClient({
          email,
          clientName: name,
          shopName: barbershop.name,
          shopSlug: barbershop.slug,
        }).catch(err => console.error('❌ [email] sendWelcomeClient:', err?.message))
      })
    }

    fireWelcomeWhatsApp(barbershopId, name, whatsapp)

    return {
      token,
      isNewBarbershopLink: false,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        whatsapp: client.whatsapp,
        barbershopId,
        barbershopSlug: barbershop.slug,
        barbershops: linkedBarbershops,
      },
    }
  },

  async login(input: LoginClientInput) {
    const identifier = String(input.identifier || '').trim()
    const password = String(input.password || '')
    const requestedSlug = String(input.barbershopSlug || '').trim().toLowerCase()

    if (!identifier || !password) {
      throw new Error('Credenciais inválidas')
    }

    const globalAccounts = await findAccountsByIdentifierGlobal(identifier)
    if (!globalAccounts.length) {
      throw new Error('Credenciais inválidas')
    }

    let authenticatedAccount: any = null
    let authenticatedClient: any = null
    let authenticatedBarbershop: any = null

    for (const candidate of globalAccounts) {
      const passwordMatches = await bcrypt.compare(password, candidate.password_hash)
      if (!passwordMatches) continue

      const client = await getClientById(candidate.client_id, candidate.barbershop_id).catch(() => null)
      if (!client || client.is_active === false) continue

      const barbershop = await getBarbershopById(candidate.barbershop_id).catch(() => null)
      if (!barbershop) continue

      authenticatedAccount = candidate
      authenticatedClient = client
      authenticatedBarbershop = barbershop
      break
    }

    if (!authenticatedAccount || !authenticatedClient || !authenticatedBarbershop) {
      throw new Error('Credenciais inválidas')
    }

    let activeAccount = authenticatedAccount
    let activeClient = authenticatedClient
    let activeBarbershop = authenticatedBarbershop

    if (requestedSlug) {
      const targetBarbershop = await getBarbershopBySlug(requestedSlug)
      const existingTargetAccount = await findAccountByIdentifier(targetBarbershop.id, identifier)

      if (existingTargetAccount?.is_active === false) {
        throw new Error('Conta indisponível')
      }

      if (existingTargetAccount) {
        const passwordMatches = await bcrypt.compare(password, existingTargetAccount.password_hash)
        if (!passwordMatches) {
          throw new Error('Credenciais inválidas')
        }

        const targetClient = await getClientById(existingTargetAccount.client_id, targetBarbershop.id)
        if (!targetClient || targetClient.is_active === false) {
          throw new Error('Conta indisponível')
        }

        activeAccount = existingTargetAccount
        activeClient = targetClient
        activeBarbershop = targetBarbershop
      } else {
        const linked = await ensureLinkedClientAccountToBarbershop({
          sourceAccount: authenticatedAccount,
          targetBarbershop,
          identifier,
        })

        activeAccount = linked.account
        activeClient = linked.client
        activeBarbershop = targetBarbershop
      }
    }

    await supabaseAdmin
      .from('client_accounts')
      .update({
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeAccount.id)
      .eq('barbershop_id', activeBarbershop.id)

    const linkedBarbershops = await getLinkedBarbershopsByAccount(activeAccount, activeBarbershop.id)

    const token = signClientToken({
      clientId: activeClient.id,
      clientAccountId: activeAccount.id,
      barbershopId: activeBarbershop.id,
      role: 'client',
    })

    return {
      token,
      client: {
        id: activeClient.id,
        name: activeClient.name,
        email: activeClient.email,
        phone: activeClient.phone,
        whatsapp: activeClient.whatsapp,
        barbershopId: activeBarbershop.id,
        barbershopSlug: activeBarbershop.slug,
        barbershops: linkedBarbershops,
      },
    }
  },

  async me(auth: ClientAuthPayload) {
    const { data: account, error } = await supabaseAdmin
      .from('client_accounts')
      .select('id, client_id, barbershop_id, email, whatsapp, is_active, last_login_at, created_at')
      .eq('id', auth.clientAccountId)
      .eq('client_id', auth.clientId)
      .eq('barbershop_id', auth.barbershopId)
      .eq('is_active', true)
      .single()

    if (error) throw new Error(error.message)

    const client = await getClientById(auth.clientId, auth.barbershopId)
    const linkedBarbershops = await getLinkedBarbershopsByAccount(account, auth.barbershopId)

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
        barbershops: linkedBarbershops,
      },
      account,
    }
  },

  async forgotPassword(input: ForgotPasswordInput) {
    const ok = {
      ok: true,
      message: 'Se os dados estiverem corretos, você receberá instruções para redefinir sua senha.',
    }

    const identifier = String(input.identifier || '').trim()
    if (!identifier) return ok

    let account: any = null
    let barbershop: any = null

    const requestedSlug = String(input.barbershopSlug || '').trim().toLowerCase()

    if (requestedSlug) {
      try {
        barbershop = await getBarbershopBySlug(requestedSlug)
        account = await findAccountByIdentifier(barbershop.id, identifier)
      } catch {
        return ok
      }
    } else {
      const accounts = await findAccountsByIdentifierGlobal(identifier)
      account = accounts?.[0] || null

      if (!account) return ok

      try {
        barbershop = await getBarbershopById(account.barbershop_id)
      } catch {
        return ok
      }
    }

    if (!account) return ok

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

    const clientEmail = account.email
    if (clientEmail) {
      const client = await getClientById(account.client_id, account.barbershop_id).catch(() => null)

      setImmediate(() => {
        sendPasswordResetClient({
          email: clientEmail,
          clientName: client?.name || 'Cliente',
          shopName: barbershop.name,
          shopSlug: barbershop.slug,
          resetToken: rawToken,
        }).catch(err => console.error('❌ [email] sendPasswordResetClient:', err?.message))
      })
    }

    return {
      ...ok,
      ...(process.env.ALLOW_CLIENT_RESET_DEBUG === 'true' ? { debugResetToken: rawToken } : {}),
    }
  },

  async resetPassword(input: ResetPasswordInput) {
    const token = String(input.token || '').trim()
    const newPassword = String(input.newPassword || '')

    if (!token) throw new Error('Token inválido')
    if (newPassword.length < 6) throw new Error('A nova senha deve ter pelo menos 6 caracteres')

    const tokenHash = hashResetToken(token)

    const { data: rows, error } = await supabaseAdmin
      .from('client_password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)

    if (error) throw new Error(error.message)

    const tokenRow = rows?.[0]
    if (!tokenRow) throw new Error('Token inválido ou expirado')

    const passwordHash = await bcrypt.hash(newPassword, 12)

    const { data: targetAccount } = await supabaseAdmin
      .from('client_accounts')
      .select('email, whatsapp')
      .eq('id', tokenRow.client_account_id)
      .single()

    if (targetAccount) {
      const field = targetAccount.email ? 'email' : 'whatsapp'
      const value = targetAccount.email || targetAccount.whatsapp

      if (value) {
        await supabaseAdmin
          .from('client_accounts')
          .update({
            password_hash: passwordHash,
            updated_at: new Date().toISOString(),
          })
          .ilike(field, value)
      }
    } else {
      await supabaseAdmin
        .from('client_accounts')
        .update({
          password_hash: passwordHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tokenRow.client_account_id)
    }

    await supabaseAdmin
      .from('client_password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)

    return { ok: true, message: 'Senha redefinida com sucesso.' }
  },
}
