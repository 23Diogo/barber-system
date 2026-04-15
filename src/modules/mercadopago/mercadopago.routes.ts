import { Router } from 'express';
import { createPreferenceController } from './mercadopago.controller';
import { mercadoPagoWebhookController } from './mercadopago.webhook.controller';

const router = Router();

router.post('/create-preference', createPreferenceController);
router.post('/webhook', mercadoPagoWebhookController);

export default router;
