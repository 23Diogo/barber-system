import { Request, Response } from 'express'
import { supabaseAdmin } from '../../config/supabase'
import { whatsappService } from './whatsapp.service'

export const verifyWebhook = (req: Request, res: Response) => {
  const mode      = req.query['hub.mode']
  const token     = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('✅ Webhook verificado!')
    return res.status(200).send(challenge)
  }
  res.status(403).json({ error: 'Forbidden' })
}

export const receiveWebhook = async (req: Request, res: Response) => {
  res.sendStatus(200)

  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : req.body

    if (body.object !== 'whatsapp_business_account') return

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value.messages?.length) continue

        const phoneNumberId = value.metadata?.phone_number_id
        const msg  = value.messages[0]
        const from = msg.from
        const text = msg.text?.body ?? ''
        if (!text) continue

        const { data: shop } = await supabaseAdmin
          .from('barbershops')
          .select('id')
          .eq('meta_phone_id', phoneNumberId)
          .maybeSingle()

        if (!shop) continue

        await whatsappService.processIncoming(shop.id, from, text, msg.id)
      }
    }
  } catch (err) {
    console.error('❌ Webhook error:', err)
  }
}
