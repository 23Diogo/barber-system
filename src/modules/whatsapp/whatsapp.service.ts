import axios from 'axios'
import { supabaseAdmin } from '../../config/supabase'

export const whatsappService = {

  async sendMessage(phoneNumberId: string, accessToken: string, to: string, body: string) {
    try {
      await axios.post(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body } },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
    } catch (err: any) {
      console.error('❌ WA send error:', err.response?.data || err.message)
    }
  },

  // ─── Mensagem de boas-vindas ao cliente após cadastro ─────────────────────────

  async sendClientWelcome({
    barbershopId,
    clientName,
    clientWhatsapp,
  }: {
    barbershopId: string
    clientName: string
    clientWhatsapp: string
  }) {
    try {
      const phone = clientWhatsapp.replace(/\D/g, '')
      if (!phone || phone.length < 10) return

      const { data: shop } = await supabaseAdmin
        .from('barbershops')
        .select('id, name, slug, meta_phone_id, meta_access_token')
        .eq('id', barbershopId)
        .single()

      if (!shop?.meta_phone_id || !shop?.meta_access_token) return

      // Verifica se a barbearia tem planos ativos
      const { data: plans } = await supabaseAdmin
        .from('plans')
        .select('id')
        .eq('barbershop_id', barbershopId)
        .eq('is_active', true)
        .limit(1)

      const hasPlans = Boolean(plans?.length)

      const baseUrl  = 'https://bbarberflow.com.br/client'
      const firstName = String(clientName || '').split(' ')[0] || 'cliente'

      const message = [
        `Olá, ${firstName}! 🎉`,
        ``,
        `Seu cadastro na *${shop.name}* foi realizado com sucesso!`,
        ``,
        `Agora você já pode agendar seus horários direto pelo celular:`,
        ``,
        `✂️ *Agendar horário*`,
        `👉 ${baseUrl}/agendar`,
        ``,
        ...(hasPlans
          ? [
              `💈 *Planos de corte*`,
              `A ${shop.name} oferece planos mensais com cortes incluídos. Confira:`,
              `👉 ${baseUrl}/planos`,
              ``,
            ]
          : []),
        `Para acessar, use o e-mail e a senha que você cadastrou.`,
        ``,
        `Te esperamos! 💈`,
      ].join('\n')

      await this.sendMessage(shop.meta_phone_id, shop.meta_access_token, phone, message)
    } catch (err: any) {
      console.error('❌ [WA] sendClientWelcome:', err?.message)
    }
  },

  // ─── Processamento de mensagens recebidas ─────────────────────────────────────

  async processIncoming(barbershopId: string, phone: string, text: string, waMessageId: string) {
    const { data: shop } = await supabaseAdmin
      .from('barbershops')
      .select('id, name, meta_phone_id, meta_access_token, is_active, absence_message, slug')
      .eq('id', barbershopId)
      .single()

    if (!shop) return

    if (!shop.is_active) {
      await this.sendMessage(shop.meta_phone_id, shop.meta_access_token, phone,
        shop.absence_message || 'No momento estamos indisponíveis. Em breve retornaremos! 💈')
      return
    }

    let { data: session } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select('*')
      .eq('barbershop_id', barbershopId)
      .eq('phone', phone)
      .maybeSingle()

    if (!session) {
      const { data: s } = await supabaseAdmin
        .from('whatsapp_sessions')
        .insert({ barbershop_id: barbershopId, phone, state: 'idle', context: {} })
        .select()
        .single()
      session = s
    }

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id, name')
      .eq('barbershop_id', barbershopId)
      .eq('whatsapp', phone)
      .maybeSingle()

    await supabaseAdmin.from('whatsapp_messages').insert({
      barbershop_id: barbershopId,
      session_id: session.id,
      client_id: client?.id ?? null,
      wa_message_id: waMessageId,
      direction: 'in',
      type: 'text',
      content: text,
      status: 'read',
      is_bot: false
    })

    const lower = text.toLowerCase().trim()
    let response = ''
    let newState = session.state

    const greetingMatch = /oi|olá|ola|bom dia|boa tarde|boa noite|quero|agendar|menu/.test(lower)

    if (session.state === 'idle' || greetingMatch) {
      const nome = client?.name ? `, ${client.name}` : ''
      response = `Olá${nome}! 👋 Bem-vindo à ${shop.name}!\n\n1️⃣ Agendar horário\n2️⃣ Ver meus agendamentos\n3️⃣ Falar com atendente`
      newState = 'menu'

    } else if (session.state === 'menu' && lower === '1') {
      const { data: services } = await supabaseAdmin
        .from('services')
        .select('id, name, price, duration_min')
        .eq('barbershop_id', barbershopId)
        .eq('is_active', true)
        .order('sort_order')

      const list = services?.map((s, i) => `${i + 1}️⃣ ${s.name} — R$${s.price}`).join('\n') ?? 'Nenhum serviço.'
      response = `✂️ Nossos serviços:\n\n${list}\n\nDigite o número:`
      newState = 'selecting_service'
      await supabaseAdmin.from('whatsapp_sessions').update({ context: { services } }).eq('id', session.id)

    } else if (session.state === 'selecting_service') {
      const services = session.context?.services ?? []
      const idx = parseInt(lower) - 1
      const svc = services[idx]
      if (!svc) {
        response = '❌ Opção inválida. Digite o número do serviço:'
      } else {
        const { data: barbers } = await supabaseAdmin
          .from('barber_profiles')
          .select('id, users(name)')
          .eq('barbershop_id', barbershopId)
          .eq('is_accepting', true)

        const list = barbers?.map((b: any, i: number) => `${i + 1}️⃣ ${b.users.name}`).join('\n') ?? ''
        response = `Serviço: *${svc.name}*\n\nEscolha o profissional:\n\n${list}`
        newState = 'selecting_barber'
        await supabaseAdmin.from('whatsapp_sessions').update({ context: { ...session.context, selectedService: svc, barbers } }).eq('id', session.id)
      }

    } else if (session.state === 'selecting_barber') {
      const barbers = session.context?.barbers ?? []
      const idx = parseInt(lower) - 1
      const barber = barbers[idx]
      if (!barber) {
        response = '❌ Opção inválida. Digite o número do profissional:'
      } else {
        response = `Profissional: *${(barber as any).users.name}*\n\nQual data? (ex: 15/04/2025)`
        newState = 'selecting_date'
        await supabaseAdmin.from('whatsapp_sessions').update({ context: { ...session.context, selectedBarber: barber } }).eq('id', session.id)
      }

    } else {
      response = `Não entendi 😅 Digite *oi* para recomeçar ou *3* para falar com atendente.`
      newState = 'idle'
    }

    await supabaseAdmin.from('whatsapp_sessions')
      .update({ state: newState, last_message_at: new Date().toISOString() })
      .eq('id', session.id)

    if (response) {
      await this.sendMessage(shop.meta_phone_id, shop.meta_access_token, phone, response)
      await supabaseAdmin.from('whatsapp_messages').insert({
        barbershop_id: barbershopId, session_id: session.id,
        client_id: client?.id ?? null, direction: 'out',
        type: 'text', content: response, status: 'sent', is_bot: true
      })
    }
  }
}
