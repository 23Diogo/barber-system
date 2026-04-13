// appointments.service.ts
import { supabaseAdmin } from '../../config/supabase'

export const appointmentsService = {

  async getAvailableSlots(barbershopId: string, barberId: string, serviceId: string, date: string) {
    const { data: svc } = await supabaseAdmin.from('services').select('duration_min').eq('id', serviceId).single()
    if (!svc) throw new Error('Serviço não encontrado')

    const { data: existing } = await supabaseAdmin
      .from('appointments')
      .select('scheduled_at, ends_at')
      .eq('barber_id', barberId)
      .gte('scheduled_at', `${date}T00:00:00Z`)
      .lte('scheduled_at', `${date}T23:59:59Z`)
      .neq('status', 'cancelled')

    const slots: string[] = []
    for (let h = 8; h < 19; h++) {
      for (let m = 0; m < 60; m += 30) {
        const start = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
        const end   = new Date(start.getTime() + svc.duration_min * 60000)
        const conflict = existing?.some(a => start < new Date(a.ends_at) && end > new Date(a.scheduled_at))
        if (!conflict && end.getHours() <= 19) slots.push(start.toISOString())
      }
    }
    return slots
  },

  async create(barbershopId: string, data: any) {
    const { data: svc } = await supabaseAdmin.from('services').select('price, duration_min').eq('id', data.serviceId).single()
    if (!svc) throw new Error('Serviço não encontrado')

    const start = new Date(data.scheduledAt)
    const end   = new Date(start.getTime() + svc.duration_min * 60000)

    const { data: apt, error } = await supabaseAdmin
      .from('appointments')
      .insert({ barbershop_id: barbershopId, client_id: data.clientId, barber_id: data.barberId, service_id: data.serviceId, scheduled_at: start.toISOString(), duration_min: svc.duration_min, ends_at: end.toISOString(), price: svc.price, final_price: svc.price, source: data.source ?? 'dashboard', status: 'confirmed' })
      .select('*, clients(name, phone), services(name), barber_profiles(users(name))')
      .single()

    if (error) throw new Error(error.message)
    return apt
  },

  async complete(id: string, barbershopId: string, paymentMethod: string) {
    const { data: apt } = await supabaseAdmin
      .from('appointments')
      .update({ status: 'completed', payment_method: paymentMethod, paid_at: new Date().toISOString() })
      .eq('id', id).eq('barbershop_id', barbershopId)
      .select('*, barber_profiles(commission_value, commission_type)')
      .single()

    if (!apt) throw new Error('Agendamento não encontrado')

    const bp  = (apt as any).barber_profiles
    const com = bp.commission_type === 'percentage' ? (apt.final_price * bp.commission_value) / 100 : bp.commission_value

    await supabaseAdmin.from('transactions').insert({
      barbershop_id: barbershopId, appointment_id: id, type: 'income',
      category: 'serviço', description: `Atendimento #${id.slice(-6)}`,
      amount: apt.final_price, payment_method: paymentMethod,
      barber_id: apt.barber_id, commission_amount: com,
      net_amount: apt.final_price - com, transaction_date: new Date().toISOString().split('T')[0]
    })

    const pts = Math.floor(apt.final_price)
    const { data: cl } = await supabaseAdmin.from('clients').select('loyalty_points').eq('id', apt.client_id).single()
    await supabaseAdmin.from('loyalty_transactions').insert({
      barbershop_id: barbershopId, client_id: apt.client_id, appointment_id: id,
      action: 'earn', points: pts,
      balance_before: cl?.loyalty_points ?? 0,
      balance_after: (cl?.loyalty_points ?? 0) + pts,
      description: 'Pontos pelo atendimento'
    })
    await supabaseAdmin.from('clients').update({ loyalty_points: (cl?.loyalty_points ?? 0) + pts }).eq('id', apt.client_id)

    return apt
  }
}
