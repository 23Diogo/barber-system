import { supabaseAdmin } from '../../config/supabase'

export const plansService = {
  async create(barbershopId: string, body: any) {
    const {
      service_entitlements = [],
      ...planBody
    } = body

    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .insert({
        ...planBody,
        barbershop_id: barbershopId,
      })
      .select()
      .single()

    if (planError) throw new Error(planError.message)

    if (Array.isArray(service_entitlements) && service_entitlements.length > 0) {
      const payload = service_entitlements.map((item: any) => ({
        plan_id: plan.id,
        service_id: item.service_id,
        included_quantity: item.included_quantity,
      }))

      const { error: entitlementsError } = await supabaseAdmin
        .from('plan_service_entitlements')
        .insert(payload)

      if (entitlementsError) throw new Error(entitlementsError.message)
    }

    const { data, error } = await supabaseAdmin
      .from('plans')
      .select(`
        *,
        plan_service_entitlements(*, services(id, name))
      `)
      .eq('id', plan.id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (error) throw new Error(error.message)

    return data
  },

  async update(id: string, barbershopId: string, body: any) {
    const {
      service_entitlements,
      ...planBody
    } = body

    const { data: existingPlan, error: existingError } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('id', id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (existingError) throw new Error(existingError.message)

    const { error: updateError } = await supabaseAdmin
      .from('plans')
      .update(planBody)
      .eq('id', existingPlan.id)
      .eq('barbershop_id', barbershopId)

    if (updateError) throw new Error(updateError.message)

    if (Array.isArray(service_entitlements)) {
      const { error: deleteError } = await supabaseAdmin
        .from('plan_service_entitlements')
        .delete()
        .eq('plan_id', existingPlan.id)

      if (deleteError) throw new Error(deleteError.message)

      if (service_entitlements.length > 0) {
        const payload = service_entitlements.map((item: any) => ({
          plan_id: existingPlan.id,
          service_id: item.service_id,
          included_quantity: item.included_quantity,
        }))

        const { error: insertError } = await supabaseAdmin
          .from('plan_service_entitlements')
          .insert(payload)

        if (insertError) throw new Error(insertError.message)
      }
    }

    const { data, error } = await supabaseAdmin
      .from('plans')
      .select(`
        *,
        plan_service_entitlements(*, services(id, name))
      `)
      .eq('id', existingPlan.id)
      .eq('barbershop_id', barbershopId)
      .single()

    if (error) throw new Error(error.message)

    return data
  }
}
