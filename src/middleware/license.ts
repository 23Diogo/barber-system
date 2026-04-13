import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../config/supabase'

export const checkLicense = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.barbershopId) return next()

  const { data, error } = await supabaseAdmin
    .from('barbershops')
    .select('is_active, plan_status, subscription_end, absence_message')
    .eq('id', req.user.barbershopId)
    .single()

  if (error || !data)
    return res.status(404).json({ error: 'Barbearia não encontrada' })

  if (data.subscription_end && new Date(data.subscription_end) < new Date()) {
    await supabaseAdmin
      .from('barbershops')
      .update({ is_active: false, plan_status: 'suspended' })
      .eq('id', req.user.barbershopId)

    return res.status(402).json({
      error: 'Licença expirada',
      message: 'Renove sua assinatura para continuar.',
      code: 'LICENSE_EXPIRED'
    })
  }

  if (!data.is_active || data.plan_status === 'suspended')
    return res.status(402).json({
      error: 'Conta suspensa',
      message: data.absence_message || 'Conta temporariamente inativa.',
      code: 'ACCOUNT_SUSPENDED'
    })

  next()
}
