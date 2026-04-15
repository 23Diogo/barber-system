export const mercadoPagoConfig = {
  accessToken: process.env.MP_ACCESS_TOKEN || '',
  webhookSecret: process.env.MP_WEBHOOK_SECRET || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5500',
};
