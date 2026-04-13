import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'

// ── Transações ────────────────────────────────────────────────
const listTransactions = async (req: Request, res: Response) => {
  try {
    const { start, end, type } = req.query
    let q = supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .order('transaction_date', { ascending: false })

    if (start) q = q.gte('transaction_date', start as string)
    if (end)   q = q.lte('transaction_date', end as string)
    if (type)  q = q.eq('type', type as string)

    const { data, error } = await q
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const createTransaction = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert({ ...req.body, barbershop_id: req.user!.barbershopId })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

// ── Contas a pagar ────────────────────────────────────────────
const listBills = async (req: Request, res: Response) => {
  try {
    const { status } = req.query
    let q = supabaseAdmin
      .from('bills')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .order('due_date')

    if (status) q = q.eq('status', status as string)

    const { data, error } = await q
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const createBill = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bills')
      .insert({ ...req.body, barbershop_id: req.user!.barbershopId })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const payBill = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bills')
      .update({ status: 'paid', paid_at: new Date().toISOString(), payment_method: req.body.paymentMethod })
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .select().single()
    if (error) throw error

    // Registrar como saída no financeiro
    await supabaseAdmin.from('transactions').insert({
      barbershop_id: req.user!.barbershopId,
      type: 'expense',
      category: data.category,
      description: data.description,
      amount: data.amount,
      payment_method: req.body.paymentMethod,
      transaction_date: new Date().toISOString().split('T')[0]
    })

    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const deleteBill = async (req: Request, res: Response) => {
  try {
    await supabaseAdmin.from('bills')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
    res.json({ success: true })
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

// ── Comissões ─────────────────────────────────────────────────
const listCommissions = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('commissions')
      .select('*, barber_profiles(users(name))')
      .eq('barbershop_id', req.user!.barbershopId)
      .order('period_start', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const router = Router()
router.use(authenticate, checkLicense)
router.get('/transactions',         listTransactions)
router.post('/transactions',        createTransaction)
router.get('/bills',                listBills)
router.post('/bills',               createBill)
router.patch('/bills/:id/pay',      payBill)
router.delete('/bills/:id',         deleteBill)
router.get('/commissions',          listCommissions)
export default router
