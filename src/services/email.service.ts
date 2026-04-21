import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM    = process.env.RESEND_FROM_EMAIL || 'suporte@bbarberflow.com.br'
const APP_URL = 'https://bbarberflow.com.br'

// ─── Layout base ──────────────────────────────────────────────────────────────

function html(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${title}</title>
<style>
  body{margin:0;padding:0;background:#07080f;font-family:'Helvetica Neue',Arial,sans-serif;color:#e8f0fe}
  .w{max-width:560px;margin:0 auto;padding:32px 16px}
  .c{background:#0a0c1a;border:1px solid #1e2345;border-radius:16px;padding:32px}
  .logo{font-size:26px;font-weight:900;color:#4fc3f7;margin-bottom:24px}
  .logo span{color:#ff4500}
  h1{font-size:20px;font-weight:700;color:#e8f0fe;margin:0 0 8px}
  p{font-size:14px;line-height:1.7;color:#c0cce8;margin:0 0 16px}
  .btn{display:inline-block;padding:14px 28px;background:linear-gradient(90deg,#00b4ff,#6c3fff);color:#fff;font-weight:700;font-size:14px;border-radius:10px;text-decoration:none;margin:16px 0}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  td{padding:8px 0;font-size:13px}
  td:first-child{color:#5a6888;width:130px}
  td:last-child{font-weight:600}
  hr{border:none;border-top:1px solid #1e2345;margin:24px 0}
  .foot{font-size:11px;color:#3a4568;text-align:center;margin-top:24px;line-height:1.6}
  .foot a{color:#3a4568}
  .warn{color:#f97316;font-weight:600}
  .ok{color:#00e676;font-weight:600}
  .info{color:#4fc3f7;font-weight:600}
</style>
</head>
<body>
<div class="w">
  <div class="c">
    <div class="logo"><span>B</span>arberFlow</div>
    ${body}
  </div>
  <div class="foot">
    &copy; ${new Date().getFullYear()} BarberFlow &middot;
    <a href="${APP_URL}">${APP_URL}</a>
  </div>
</div>
</body>
</html>`
}

async function send(to: string, subject: string, body: string): Promise<void> {
  try {
    await resend.emails.send({ from: FROM, to, subject, html: html(subject, body) })
  } catch (err: any) {
    console.error(`❌ [email] Falha ao enviar para ${to}:`, err?.message)
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function sendWelcomeOwner(p: {
  email: string
  ownerName: string
  shopName: string
}) {
  await send(
    p.email,
    `Bem-vindo ao BarberFlow, ${p.ownerName}!`,
    `<h1>Bem-vindo, ${p.ownerName}! 🎉</h1>
     <p>Sua barbearia <strong class="info">${p.shopName}</strong> foi cadastrada com sucesso no BarberFlow.</p>
     <p>Agora você tem acesso completo ao painel de gestão: agendamentos, financeiro, estoque, clientes, planos de fidelidade e muito mais.</p>
     <a class="btn" href="${APP_URL}/app">Acessar meu painel &rarr;</a>
     <hr/>
     <p style="font-size:12px;color:#5a6888">Dúvidas? Responda este e-mail ou acesse <a href="${APP_URL}" style="color:#4fc3f7">${APP_URL}</a></p>`
  )
}

export async function sendWelcomeClient(p: {
  email: string
  clientName: string
  shopName: string
  shopSlug: string
}) {
  const url = `${APP_URL}/client/${p.shopSlug}`
  await send(
    p.email,
    `Sua conta na ${p.shopName} foi criada`,
    `<h1>Olá, ${p.clientName}! 👋</h1>
     <p>Sua conta foi criada na <strong class="info">${p.shopName}</strong>.</p>
     <p>Pelo portal você pode agendar horários, acompanhar seus agendamentos e ver seu histórico de serviços.</p>
     <a class="btn" href="${url}">Acessar portal &rarr;</a>`
  )
}

export async function sendPasswordResetOwner(p: {
  email: string
  ownerName: string
  resetToken: string
}) {
  const url = `${APP_URL}/app/nova-senha?token=${p.resetToken}`
  await send(
    p.email,
    'BarberFlow — Redefinição de senha',
    `<h1>Redefinir sua senha</h1>
     <p>Olá, <strong>${p.ownerName}</strong>. Recebemos uma solicitação para redefinir a senha da sua conta.</p>
     <a class="btn" href="${url}">Redefinir senha &rarr;</a>
     <p style="font-size:12px;color:#5a6888">
       Se você não solicitou a redefinição, ignore este e-mail.<br/>
       O link expira em <span class="warn">1 hora</span>.
     </p>`
  )
}

export async function sendPasswordResetClient(p: {
  email: string
  clientName: string
  shopName: string
  shopSlug: string
  resetToken: string
}) {
  const url = `${APP_URL}/client/${p.shopSlug}/nova-senha?token=${p.resetToken}`
  await send(
    p.email,
    `${p.shopName} — Redefinição de senha`,
    `<h1>Redefinir sua senha</h1>
     <p>Olá, <strong>${p.clientName}</strong>. Recebemos uma solicitação para redefinir sua senha no portal da <strong class="info">${p.shopName}</strong>.</p>
     <a class="btn" href="${url}">Redefinir senha &rarr;</a>
     <p style="font-size:12px;color:#5a6888">
       Se você não solicitou a redefinição, ignore este e-mail.<br/>
       O link expira em <span class="warn">30 minutos</span>.
     </p>`
  )
}

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
  await send(
    p.email,
    `Agendamento confirmado — ${p.shopName}`,
    `<h1>✅ Agendamento confirmado!</h1>
     <p>Olá, <strong>${p.clientName}</strong>! Seu agendamento na <strong class="info">${p.shopName}</strong> foi confirmado.</p>
     <table>
       <tr><td>Serviço</td><td>${p.serviceName}</td></tr>
       <tr><td>Profissional</td><td>${p.barberName}</td></tr>
       <tr><td>Data</td><td>${p.date}</td></tr>
       <tr><td>Horário</td><td class="info">${p.time}</td></tr>
       ${p.address ? `<tr><td>Endereço</td><td>${p.address}</td></tr>` : ''}
     </table>
     <a class="btn" href="${APP_URL}/client/${p.shopSlug}">Ver agendamento &rarr;</a>
     <p style="font-size:12px;color:#5a6888">Precisa cancelar? Acesse o portal com antecedência.</p>`
  )
}

export async function sendAppointmentCancelled(p: {
  email: string
  clientName: string
  shopName: string
  shopSlug: string
  serviceName: string
  date: string
  time: string
}) {
  await send(
    p.email,
    `Agendamento cancelado — ${p.shopName}`,
    `<h1>❌ Agendamento cancelado</h1>
     <p>Olá, <strong>${p.clientName}</strong>. Seu agendamento na <strong class="info">${p.shopName}</strong> foi cancelado.</p>
     <table>
       <tr><td>Serviço</td><td>${p.serviceName}</td></tr>
       <tr><td>Data</td><td>${p.date}</td></tr>
       <tr><td>Horário</td><td>${p.time}</td></tr>
     </table>
     <a class="btn" href="${APP_URL}/client/${p.shopSlug}">Reagendar &rarr;</a>`
  )
}

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
    ? '<span class="warn">⚠️ Vence HOJE!</span>'
    : p.daysUntil === 1
      ? '<span class="warn">⚠️ Vence amanhã!</span>'
      : `Vence em <strong>${p.daysUntil} dias</strong>`

  await send(
    p.email,
    `BarberFlow — Mensalidade vence ${p.daysUntil === 0 ? 'hoje' : `em ${p.daysUntil} dias`}`,
    `<h1>🔔 Lembrete de mensalidade</h1>
     <p>Olá, <strong>${p.ownerName}</strong>. ${urgency}</p>
     <table>
       <tr><td>Barbearia</td><td>${p.shopName}</td></tr>
       <tr><td>Plano</td><td>${p.planName}</td></tr>
       <tr><td>Valor</td><td class="info">${p.amount}</td></tr>
       <tr><td>Vencimento</td><td>${p.dueDate}</td></tr>
     </table>
     <a class="btn" href="${APP_URL}/planos">Efetuar pagamento &rarr;</a>`
  )
}

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
    ? '<span class="warn">⚠️ Vence HOJE!</span>'
    : p.daysUntil === 1
      ? '<span class="warn">⚠️ Vence amanhã!</span>'
      : `Vence em <strong>${p.daysUntil} dias</strong>`

  await send(
    p.email,
    `${p.shopName} — Conta vence ${p.daysUntil === 0 ? 'hoje' : `em ${p.daysUntil} dias`}`,
    `<h1>💳 Conta a pagar</h1>
     <p>Olá, <strong>${p.ownerName}</strong>. ${urgency}</p>
     <table>
       <tr><td>Barbearia</td><td>${p.shopName}</td></tr>
       <tr><td>Descrição</td><td>${p.description}</td></tr>
       <tr><td>Valor</td><td class="info">${p.amount}</td></tr>
       <tr><td>Vencimento</td><td>${p.dueDate}</td></tr>
     </table>
     <a class="btn" href="${APP_URL}/app/fin">Ver financeiro &rarr;</a>`
  )
}
