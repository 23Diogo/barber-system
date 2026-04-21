import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM_EMAIL || 'suporte@bbarberflow.com.br'
const APP_NAME = 'BarberFlow'
const APP_URL  = 'https://bbarberflow.com.br'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseLayout(title: string, body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
      <title>${title}</title>
      <style>
        body { margin:0; padding:0; background:#07080f; font-family:'Helvetica Neue',Arial,sans-serif; color:#e8f0fe; }
        .wrapper { max-width:560px; margin:0 auto; padding:32px 16px; }
        .card { background:#0a0c1a; border:1px solid #1e2345; border-radius:16px; padding:32px; }
        .logo { font-size:28px; font-weight:900; color:#4fc3f7; letter-spacing:.04em; margin-bottom:24px; }
        .logo span { color:#ff4500; }
        h1 { font-size:20px; font-weight:700; color:#e8f0fe; margin:0 0 8px; }
        p { font-size:14px; line-height:1.7; color:#c0cce8; margin:0 0 16px; }
        .btn { display:inline-block; padding:14px 28px; background:linear-gradient(90deg,#00b4ff,#6c3fff); color:#fff; font-weight:700; font-size:14px; border-radius:10px; text-decoration:none; margin:16px 0; }
        .code { background:#131620; border:1px solid #232845; border-radius:8px; padding:16px; font-size:24px; font-weight:900; letter-spacing:.2em; color:#4fc3f7; text-align:center; margin:16px 0; }
        .divider { border:none; border-top:1px solid #1e2345; margin:24px 0; }
        .footer { font-size:11px; color:#3a4568; text-align:center; margin-top:24px; line-height:1.6; }
        .highlight { color:#4fc3f7; font-weight:600; }
        .warning { color:#f97316; font-weight:600; }
        .success { color:#00e676; font-weight:600; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="logo"><span>B</span>arberFlow</div>
          ${body}
        </div>
        <div class="footer">
          © ${new Date().getFullYear()} ${APP_NAME} · <a href="${APP_URL}" style="color:#3a4568">${APP_URL}</a><br/>
          Você está recebendo este e-mail porque tem uma conta no ${APP_NAME}.
        </div>
      </div>
    </body>
    </html>
  `
}

async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    await resend.emails.send({ from: FROM, to, subject, html })
  } catch (err: any) {
    console.error(`❌ [email] Falha ao enviar para ${to}:`, err?.message)
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

// 1. Boas-vindas — dono da barbearia
export async function sendWelcomeOwner(p: {
  email: string
  ownerName: string
  shopName: string
}) {
  const html = baseLayout('Bem-vindo ao BarberFlow', `
    <h1>Bem-vindo, ${p.ownerName}! 🎉</h1>
    <p>Sua barbearia <strong class="highlight">${p.shopName}</strong> foi cadastrada com sucesso no ${APP_NAME}.</p>
    <p>Agora você tem acesso completo ao painel de gestão: agendamentos, financeiro, estoque, clientes, planos de fidelidade e muito mais.</p>
    <a class="btn" href="${APP_URL}/app">Acessar meu painel →</a>
    <hr class="divider"/>
    <p>Se tiver qualquer dúvida, responda este e-mail ou acesse nosso suporte.</p>
  `)
  await send(p.email, `Bem-vindo ao ${APP_NAME}, ${p.ownerName}!`, html)
}

// 2. Boas-vindas — cliente da barbearia
export async function sendWelcomeClient(p: {
  email: string
  clientName: string
  shopName: string
  shopSlug: string
}) {
  const portalUrl = `${APP_URL}/client/${p.shopSlug}`
  const html = baseLayout('Bem-vindo', `
    <h1>Olá, ${p.clientName}! 👋</h1>
    <p>Sua conta foi criada na <strong class="highlight">${p.shopName}</strong>.</p>
    <p>Pelo portal você pode agendar horários, acompanhar seus agendamentos e ver seu histórico de serviços.</p>
    <a class="btn" href="${portalUrl}">Acessar portal →</a>
  `)
  await send(p.email, `Sua conta na ${p.shopName} foi criada`, html)
}

// 3. Recuperação de senha — dono
export async function sendPasswordResetOwner(p: {
  email: string
  ownerName: string
  resetToken: string
}) {
  const resetUrl = `${APP_URL}/app/nova-senha?token=${p.resetToken}`
  const html = baseLayout('Redefinir senha', `
    <h1>Redefinir sua senha</h1>
    <p>Olá, <strong>${p.ownerName}</strong>. Recebemos uma solicitação para redefinir a senha da sua conta no ${APP_NAME}.</p>
    <a class="btn" href="${resetUrl}">Redefinir senha →</a>
    <p style="font-size:12px;color:#5a6888;">Se você não solicitou a redefinição, ignore este e-mail. O link expira em <span class="warning">1 hora</span>.</p>
  `)
  await send(p.email, `${APP_NAME} — Redefinição de senha`, html)
}

// 4. Recuperação de senha — cliente
export async function sendPasswordResetClient(p: {
  email: string
  clientName: string
  shopName: string
  shopSlug: string
  resetToken: string
}) {
  const resetUrl = `${APP_URL}/client/${p.shopSlug}/nova-senha?token=${p.resetToken}`
  const html = baseLayout('Redefinir senha', `
    <h1>Redefinir sua senha</h1>
    <p>Olá, <strong>${p.clientName}</strong>. Recebemos uma solicitação para redefinir sua senha no portal da <strong class="highlight">${p.shopName}</strong>.</p>
    <a class="btn" href="${resetUrl}">Redefinir senha →</a>
    <p style="font-size:12px;color:#5a6888;">Se você não solicitou a redefinição, ignore este e-mail. O link expira em <span class="warning">1 hora</span>.</p>
  `)
  await send(p.email, `${p.shopName} — Redefinição de senha`, html)
}

// 5. Confirmação de agendamento — cliente
export async function sendAppointmentConfirmed(p: {
  email: string
  clientName: string
  shopName: string
  shopSlug: string
  serviceName: string
  barberName: string
  date: string
  time: string
  address?: string
}) {
  const cancelUrl = `${APP_URL}/client/${p.shopSlug}`
  const html = baseLayout('Agendamento confirmado', `
    <h1>✅ Agendamento confirmado!</h1>
    <p>Olá, <strong>${p.clientName}</strong>! Seu agendamento na <strong class="highlight">${p.shopName}</strong> foi confirmado.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Serviço</td><td style="padding:8px 0;font-weight:600;">${p.serviceName}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Profissional</td><td style="padding:8px 0;font-weight:600;">${p.barberName}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Data</td><td style="padding:8px 0;font-weight:600;">${p.date}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Horário</td><td style="padding:8px 0;font-weight:600;color:#4fc3f7;">${p.time}</td></tr>
      ${p.address ? `<tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Endereço</td><td style="padding:8px 0;">${p.address}</td></tr>` : ''}
    </table>
    <a class="btn" href="${cancelUrl}">Ver agendamento →</a>
    <p style="font-size:12px;color:#5a6888;">Precisa cancelar? Acesse o portal com antecedência.</p>
  `)
  await send(p.email, `Agendamento confirmado — ${p.shopName}`, html)
}

// 6. Cancelamento de agendamento — cliente
export async function sendAppointmentCancelled(p: {
  email: string
  clientName: string
  shopName: string
  shopSlug: string
  serviceName: string
  date: string
  time: string
}) {
  const bookUrl = `${APP_URL}/client/${p.shopSlug}`
  const html = baseLayout('Agendamento cancelado', `
    <h1>❌ Agendamento cancelado</h1>
    <p>Olá, <strong>${p.clientName}</strong>. Seu agendamento na <strong class="highlight">${p.shopName}</strong> foi cancelado.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Serviço</td><td style="padding:8px 0;font-weight:600;">${p.serviceName}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Data</td><td style="padding:8px 0;font-weight:600;">${p.date}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Horário</td><td style="padding:8px 0;font-weight:600;">${p.time}</td></tr>
    </table>
    <a class="btn" href="${bookUrl}">Reagendar →</a>
  `)
  await send(p.email, `Agendamento cancelado — ${p.shopName}`, html)
}

// 7. Lembrete de mensalidade — dono
export async function sendSubscriptionReminder(p: {
  email: string
  ownerName: string
  shopName: string
  planName: string
  amount: string
  dueDate: string
  daysUntil: number
}) {
  const urgency = p.daysUntil === 0
    ? '<span class="warning">⚠️ Vence HOJE!</span>'
    : p.daysUntil === 1
      ? '<span class="warning">⚠️ Vence amanhã!</span>'
      : `Vence em <strong>${p.daysUntil} dias</strong>`

  const html = baseLayout('Lembrete de mensalidade', `
    <h1>🔔 Lembrete de mensalidade</h1>
    <p>Olá, <strong>${p.ownerName}</strong>. ${urgency}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Barbearia</td><td style="padding:8px 0;font-weight:600;">${p.shopName}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Plano</td><td style="padding:8px 0;font-weight:600;">${p.planName}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Valor</td><td style="padding:8px 0;font-weight:600;color:#4fc3f7;">${p.amount}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Vencimento</td><td style="padding:8px 0;font-weight:600;">${p.dueDate}</td></tr>
    </table>
    <a class="btn" href="${APP_URL}/planos">Efetuar pagamento →</a>
    <p style="font-size:12px;color:#5a6888;">Mantenha seu sistema ativo efetuando o pagamento até a data de vencimento.</p>
  `)
  await send(p.email, `${APP_NAME} — Mensalidade vence em ${p.daysUntil === 0 ? 'hoje' : p.daysUntil + ' dias'}`, html)
}

// 8. Lembrete de conta a pagar — dono
export async function sendBillReminder(p: {
  email: string
  ownerName: string
  shopName: string
  description: string
  amount: string
  dueDate: string
  daysUntil: number
}) {
  const urgency = p.daysUntil === 0
    ? '<span class="warning">⚠️ Vence HOJE!</span>'
    : p.daysUntil === 1
      ? '<span class="warning">⚠️ Vence amanhã!</span>'
      : `Vence em <strong>${p.daysUntil} dias</strong>`

  const html = baseLayout('Lembrete de conta', `
    <h1>💳 Conta a pagar</h1>
    <p>Olá, <strong>${p.ownerName}</strong>. ${urgency}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Barbearia</td><td style="padding:8px 0;font-weight:600;">${p.shopName}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Descrição</td><td style="padding:8px 0;font-weight:600;">${p.description}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Valor</td><td style="padding:8px 0;font-weight:600;color:#4fc3f7;">${p.amount}</td></tr>
      <tr><td style="padding:8px 0;color:#5a6888;font-size:13px;">Vencimento</td><td style="padding:8px 0;font-weight:600;">${p.dueDate}</td></tr>
    </table>
    <a class="btn" href="${APP_URL}/app/fin">Ver financeiro →</a>
  `)
  await send(p.email, `${p.shopName} — Conta vence em ${p.daysUntil === 0 ? 'hoje' : p.daysUntil + ' dias'}`, html)
}
