import { Router } from 'express'
import { Request, Response } from 'express'
import { authenticate } from '../../middleware/auth'
import { checkLicense }  from '../../middleware/license'
import { supabaseAdmin } from '../../config/supabase'
import { whatsappService } from '../whatsapp/whatsapp.service'

const listCampaigns = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const createCampaign = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .insert({ ...req.body, barbershop_id: req.user!.barbershopId })
      .select().single()
    if (error) throw error
    res.status(201).json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const sendCampaign = async (req: Request, res: Response) => {
  try {
    const { data: campaign } = await supabaseAdmin
      .from('campaigns')
      .select('*, message_templates(content)')
      .eq('id', req.params.id)
      .eq('barbershop_id', req.user!.barbershopId)
      .single()

    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' })

    const { data: shop } = await supabaseAdmin
      .from('barbershops')
      .select('meta_phone_id, meta_access_token, slug')
      .eq('id', req.user!.barbershopId)
      .single()

    // Buscar clientes inativos
    const { data: clients } = await supabaseAdmin
      .from('vw_inactive_clients')
      .select('id, name, whatsapp, days_inactive')
      .eq('barbershop_id', req.user!.barbershopId)

    let sent = 0
    for (const client of clients ?? []) {
      if (!client.whatsapp) continue

      const template = (campaign as any).message_templates?.content ?? ''
      const msg = template
        .replace('{{nome}}', client.name)
        .replace('{{dias}}', client.days_inactive)
        .replace('{{link}}', `https://barberflow.app/${shop?.slug}`)

      await whatsappService.sendMessage(shop!.meta_phone_id, shop!.meta_access_token, client.whatsapp, msg)

      await supabaseAdmin.from('campaign_logs').insert({
        campaign_id: campaign.id, client_id: client.id, status: 'sent'
      })
      sent++
    }

    await supabaseAdmin.from('campaigns')
      .update({ status: 'completed', sent_count: sent, completed_at: new Date().toISOString() })
      .eq('id', campaign.id)

    res.json({ success: true, sent })
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const inactiveClients = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('vw_inactive_clients')
      .select('*')
      .eq('barbershop_id', req.user!.barbershopId)
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const listTemplates = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .or(`barbershop_id.eq.${req.user!.barbershopId},barbershop_id.is.null`)
      .eq('is_active', true)
    if (error) throw error
    res.json(data)
  } catch (err: any) { res.status(400).json({ error: err.message }) }
}

const router = Router()
router.use(authenticate, checkLicense)
router.get('/campaigns',          listCampaigns)
router.post('/campaigns',         createCampaign)
router.post('/campaigns/:id/send',sendCampaign)
router.get('/inactive-clients',   inactiveClients)
router.get('/templates',          listTemplates)
export default router
