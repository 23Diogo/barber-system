import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'

const getDashboard = async (req: Request, res: Response) => {
  try {
    const { period = 'month' } = req.query
    const id  = req.user!.barbershopId
    const now = new Date()

    let startDate: string
    if (period === 'day') {
      startDate = now.toISOString().split('T')[0]
    } else if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    }

    const today = now.toISOString().split('T')[0]

    const [txRes, aptRes, clientRes, billRes, stockRes, rankRes, todayRes] = await Promise.all([
      supabaseAdmin.from('transactions').select('type, amount').eq('barbershop_id', id).gte('transaction_date', startDate),
      supabaseAdmin.from('appointments').select('status, final_price').eq('barbershop_id', id).gte('scheduled_at', `${startDate}T00:00:00Z`),
      supabaseAdmin.from('clients').select('id', { count: 'exact', head: true }).eq('barbershop_id', id).eq('is_active', true),
      supabaseAdmin.from('vw_upcoming_bills').select('*').eq('barbershop_id', id),
      supabaseAdmin.from('vw_low_stock').select('*').eq('barbershop_id', id),
      supabaseAdmin.from('vw_barber_performance').select('*').eq('barbershop_id', id).order('total_revenue', { ascending: false }).limit(5),
      supabaseAdmin.from('appointments')
        .select('id, scheduled_at, ends_at, status, clients(name, photo_url), services(name), barber_profiles(users(name))')
        .eq('barbershop_id', id)
        .gte('scheduled_at', `${today}T00:00:00Z`)
        .lte('scheduled_at', `${today}T23:59:59Z`)
        .neq('status', 'cancelled')
        .order('scheduled_at')
    ])

    const tx      = txRes.data ?? []
    const apts    = aptRes.data ?? []
    const income  = tx.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
    const expense = tx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const completed = apts.filter(a => a.status === 'completed').length
    const total     = apts.filter(a => a.status !== 'cancelled').length

    res.json({
      period,
      revenue:        { gross_income: income, total_expenses: expense, net_profit: income - expense },
      appointments:   { total, completed, pending: apts.filter(a => a.status === 'pending').length, cancelled: apts.filter(a => a.status === 'cancelled').length, occupancy_pct: total > 0 ? Math.round((completed / total) * 100) : 0 },
      clients:        { total_active: clientRes.count ?? 0 },
      upcoming_bills: billRes.data  ?? [],
      low_stock:      stockRes.data ?? [],
      barber_ranking: rankRes.data  ?? [],
      today_schedule: todayRes.data ?? []
    })
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const getRevenueChart = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('vw_revenue_summary')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .order('day', { ascending: true })
      .limit(30)
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const router = Router()
router.use(authenticate, checkLicense)
router.get('/',        getDashboard)
router.get('/revenue', getRevenueChart)
export default router
