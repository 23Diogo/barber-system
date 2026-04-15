import { Request, Response } from 'express';

export async function mercadoPagoWebhookController(req: Request, res: Response) {
  try {
    console.log('Webhook Mercado Pago recebido');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);

    return res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar webhook Mercado Pago:', error);
    return res.sendStatus(500);
  }
}
