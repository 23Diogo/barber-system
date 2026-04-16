import { Request, Response } from 'express';
import { createMercadoPagoPreference } from './mercadopago.service';

export async function createPreferenceController(req: Request, res: Response) {
  try {
    const { title, quantity, unitPrice, externalReference } = req.body;

    const preference = await createMercadoPagoPreference({
      title: title || 'Teste BarberFlow',
      quantity: Number(quantity || 1),
      unitPrice: Number(unitPrice || 10),
      externalReference: externalReference || undefined,
    });

    return res.status(200).json({
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao criar preferência',
    });
  }
}
