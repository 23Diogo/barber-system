import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../config/supabase'

export const checkPlatformLicense = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const barbershopId = req.user?.barbershopId
    if (!barbershopId) return res.status(401).json({ error: 'Não autenticado' })

    const { data: license, error } = await supabaseAdmin
      .from('barbershop_licenses')
      .select('status, current_period_end, grace_days')
      .eq('barbershop_id', barbershopId)
      .single()

    // Sem licença = suspenso
    if (error || !license) {
      return res.status(403).json({
        error: 'license_suspended',
        message: 'Sua assinatura está inativa. Regularize para continuar usando o BarberFlow.',
      })
    }

    if (license.status === 'cancelled') {
      return res.status(403).json({
        error: 'license_cancelled',
        message: 'Sua assinatura foi cancelada.',
      })
    }

    if (license.status === 'suspended') {
      return res.status(403).json({
        error: 'license_suspended',
        message: 'Sua assinatura está suspensa. Regularize o pagamento para continuar.',
      })
    }

    // Verifica carência mesmo com status active
    if (license.current_period_end) {
      const periodEnd = new Date(license.current_period_end)
      const graceEnd = new Date(periodEnd)
      graceEnd.setDate(graceEnd.getDate() + (license.grace_days ?? 5))

      if (new Date() > graceEnd) {
        // Já passou da carência — suspende agora
        await supabaseAdmin
          .from('barbershop_licenses')
          .update({ status: 'suspended', suspended_at: new Date().toISOString() })
          .eq('barbershop_id', barbershopId)

        return res.status(403).json({
          error: 'license_suspended',
          message: 'Sua assinatura está suspensa. Regularize o pagamento para continuar.',
        })
      }
    }

    next()
  } catch (err: any) {
    console.error('❌ [platformLicense]', err.message)
    res.status(500).json({ error: 'Erro ao verificar licença' })
  }
}
