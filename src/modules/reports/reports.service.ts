import { supabaseAdmin } from '../../config/supabase'

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString()
}

function startOfPrevMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1).toISOString()
}

function endOfPrevMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59).toISOString()
}

function monthLabel(offset: number) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
}

export const reportsService = {
  async getGrowthPanel(barbershopId: string) {
    const now = new Date()
    const thisMonthStart = startOfMonth(now)
    const prevMonthStart = startOfPrevMonth(now)
    const prevMonthEnd   = endOfPrevMonth(now)

    // ── 6 meses de histórico de receita ──────────────────────────────────────
    const monthlyRevenue: { label: string; avulso: number; assinatura: number }[] = []

    for (let i = -5; i <= 0; i++) {
      const d     = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const { data: apts } = await supabaseAdmin
        .from('appointments')
        .select('billing_mode, final_price')
        .eq('barbershop_id', barbershopId)
        .eq('status', 'completed')
        .gte('scheduled_at', start)
        .lte('scheduled_at', end)

      const avulso      = (apts || []).filter(a => a.billing_mode !== 'subscription').reduce((s, a) => s + Number(a.final_price || 0), 0)
      const assinatura  = (apts || []).filter(a => a.billing_mode === 'subscription').reduce((s, a) => s + Number(a.final_price || 0), 0)

      monthlyRevenue.push({ label: monthLabel(i), avulso, assinatura })
    }

    // ── Receita mês atual vs mês anterior ────────────────────────────────────
    const { data: thisMonthApts } = await supabaseAdmin
      .from('appointments')
      .select('final_price, billing_mode')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'completed')
      .gte('scheduled_at', thisMonthStart)

    const { data: prevMonthApts } = await supabaseAdmin
      .from('appointments')
      .select('final_price')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'completed')
      .gte('scheduled_at', prevMonthStart)
      .lte('scheduled_at', prevMonthEnd)

    const revenueThis = (thisMonthApts || []).reduce((s, a) => s + Number(a.final_price || 0), 0)
    const revenuePrev = (prevMonthApts || []).reduce((s, a) => s + Number(a.final_price || 0), 0)
    const revenueGrowth = revenuePrev > 0 ? ((revenueThis - revenuePrev) / revenuePrev) * 100 : null

    const ticketMedio = thisMonthApts && thisMonthApts.length > 0
      ? revenueThis / thisMonthApts.length : 0

    // ── Total de atendimentos e cancelamentos ────────────────────────────────
    const { data: allApts } = await supabaseAdmin
      .from('appointments')
      .select('status')
      .eq('barbershop_id', barbershopId)
      .gte('scheduled_at', thisMonthStart)

    const totalApts      = (allApts || []).length
    const cancelledApts  = (allApts || []).filter(a => a.status === 'cancelled').length
    const cancellationRate = totalApts > 0 ? (cancelledApts / totalApts) * 100 : 0

    // ── Taxa de ocupação ─────────────────────────────────────────────────────
    const { data: barbers } = await supabaseAdmin
      .from('barber_profiles')
      .select('id, working_hours')
      .eq('barbershop_id', barbershopId)

    const diasNoMes       = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const diasUteis       = Math.round(diasNoMes * 5 / 7)
    const horasPorDia     = 8
    const slotMinutos     = 30
    const totalSlots      = (barbers || []).length * diasUteis * (horasPorDia * 60 / slotMinutos)

    const { data: completedApts } = await supabaseAdmin
      .from('appointments')
      .select('duration_min')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'completed')
      .gte('scheduled_at', thisMonthStart)

    const slotsUsados    = (completedApts || []).reduce((s, a) => s + Math.ceil(Number(a.duration_min || 30) / 30), 0)
    const occupationRate = totalSlots > 0 ? Math.min(100, (slotsUsados / totalSlots) * 100) : 0

    // ── Receita por barbeiro ─────────────────────────────────────────────────
    const { data: byBarber } = await supabaseAdmin
      .from('appointments')
      .select('barber_id, final_price, barber_profiles(users(name))')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'completed')
      .gte('scheduled_at', thisMonthStart)

    const barberMap: Record<string, { name: string; revenue: number; count: number }> = {}
    for (const apt of (byBarber || [])) {
      const id   = apt.barber_id
      const user = Array.isArray((apt as any).barber_profiles?.users)
        ? (apt as any).barber_profiles.users[0]
        : (apt as any).barber_profiles?.users
      const name = user?.name || 'Sem nome'
      if (!barberMap[id]) barberMap[id] = { name, revenue: 0, count: 0 }
      barberMap[id].revenue += Number(apt.final_price || 0)
      barberMap[id].count   += 1
    }

    const barberRevenue = Object.values(barberMap).sort((a, b) => b.revenue - a.revenue)

    // ── Clientes novos vs retorno ────────────────────────────────────────────
    const { data: thisMonthClients } = await supabaseAdmin
      .from('appointments')
      .select('client_id')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'completed')
      .gte('scheduled_at', thisMonthStart)

    const { data: prevClients } = await supabaseAdmin
      .from('appointments')
      .select('client_id')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'completed')
      .lt('scheduled_at', thisMonthStart)

    const prevClientIds    = new Set((prevClients || []).map(a => a.client_id))
    const thisClientIds    = new Set((thisMonthClients || []).map(a => a.client_id))
    const newClients       = [...thisClientIds].filter(id => !prevClientIds.has(id)).length
    const returningClients = [...thisClientIds].filter(id => prevClientIds.has(id)).length

    // ── Total de clientes cadastrados ────────────────────────────────────────
    const { count: totalClients } = await supabaseAdmin
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true)

    // ── Assinaturas ativas ───────────────────────────────────────────────────
    const { count: activeSubscriptions } = await supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('barbershop_id', barbershopId)
      .eq('status', 'active')

    const { data: subRevenue } = await supabaseAdmin
      .from('subscriptions')
      .select('plans(price)')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'active')

    const mrr = (subRevenue || []).reduce((s: number, sub: any) => {
      const price = Array.isArray(sub.plans) ? sub.plans[0]?.price : sub.plans?.price
      return s + Number(price || 0)
    }, 0)

    // ── Projeção 6 meses ─────────────────────────────────────────────────────
    const avgMonthlyRevenue = monthlyRevenue.reduce((s, m) => s + m.avulso + m.assinatura, 0) / 6
    const growthRateConservador = 0.15
    const growthRateOtimista    = 0.30

    const projection = Array.from({ length: 6 }, (_, i) => ({
      label:       monthLabel(i + 1),
      conservador: Math.round(avgMonthlyRevenue * Math.pow(1 + growthRateConservador, i + 1)),
      otimista:    Math.round(avgMonthlyRevenue * Math.pow(1 + growthRateOtimista, i + 1)),
    }))

    // ── Retorna tudo ─────────────────────────────────────────────────────────
    return {
      overview: {
        revenueThis:       Math.round(revenueThis * 100) / 100,
        revenuePrev:       Math.round(revenuePrev * 100) / 100,
        revenueGrowth:     revenueGrowth !== null ? Math.round(revenueGrowth * 10) / 10 : null,
        ticketMedio:       Math.round(ticketMedio * 100) / 100,
        occupationRate:    Math.round(occupationRate * 10) / 10,
        cancellationRate:  Math.round(cancellationRate * 10) / 10,
        totalClients:      totalClients || 0,
        activeSubscriptions: activeSubscriptions || 0,
        mrr:               Math.round(mrr * 100) / 100,
        totalAppointments: (thisMonthApts || []).length,
      },
      monthlyRevenue,
      barberRevenue,
      clients: { newClients, returningClients },
      projection,
    }
  },
}
