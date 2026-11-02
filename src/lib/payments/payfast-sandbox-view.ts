import 'server-only';
import { PAYFAST_SANDBOX_PROCESS_URL } from './payfast-sandbox';
import type { SandboxSession } from './payfast-sandbox-store';

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function sandboxHtml(content: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>PayFast Sandbox — Street Culture</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f6f0;color:#131712;font:17px/1.6 system-ui,sans-serif}
main{max-width:760px;margin:48px auto;padding:32px;background:white;border:1px solid #deded4;border-radius:24px}
small{letter-spacing:.12em;font-weight:800}h1{font-size:clamp(30px,6vw,48px);line-height:1.1}h2{font-size:24px}
.badge,button{background:#c4ff00;color:#101400;border:0;border-radius:12px;font-weight:800}.badge{display:inline-block;padding:8px 14px}
button{font:inherit;font-weight:800;padding:16px 24px;cursor:pointer}a{color:#164e2d;font-weight:700}.panel{padding:20px;background:#f1f3e9;border-radius:16px;margin:24px 0}
dt{font-weight:700}dd{margin:0 0 12px;overflow-wrap:anywhere}footer{border-top:1px solid #deded4;margin-top:28px;padding-top:20px;font-size:14px}
@media(max-width:600px){main{margin:16px;padding:24px}}
</style></head><body><main><small>STREET CULTURE · ADMIN TEST TOOL</small>
<p><span class="badge">SANDBOX ONLY · NO REAL MONEY</span></p>${content}
<footer>No product sale, inventory reservation, receipt, customer email or courier booking is created.
Live PayFast/card payments remain disabled.</footer></main></body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://sandbox.payfast.co.za; frame-ancestors 'none'; base-uri 'none'" },
  });
}

export function sandboxHome(session?: SandboxSession | null, cancelled = false) {
  const money = (value: number) => `ZAR ${(value / 100).toFixed(2)}`;
  const detail = session ? `<section class="panel"><h2>${session.state === 'COMPLETE' ? 'Sandbox payment verified' : 'Awaiting verified PayFast notification'}</h2>
${cancelled ? '<p>You returned using the cancel link. This does not change the verified payment record.</p>' : ''}
<dl><dt>Test reference</dt><dd>SC-SBX-${escapeHtml(session.id)}</dd>
<dt>Virtual amount</dt><dd>${money(session.amount_minor)}</dd>
${session.state === 'COMPLETE' ? `<dt>PayFast test transaction</dt><dd>${escapeHtml(session.provider_payment_id || '')}</dd>
<dt>Sandbox fee / net (not real income)</dt><dd>${money(session.fee_minor!)} / ${money(session.net_minor!)}</dd>` :
'<dt>Status</dt><dd>Pending. A return URL or browser cancellation never marks a payment paid.</dd>'}</dl>
<a href="/sandbox/payfast?session=${escapeHtml(session.id)}">Refresh verification status</a></section>` : '';
  return sandboxHtml(`<h1>Test PayFast safely.</h1><p>Use PayFast’s virtual wallet to test a fixed <strong>ZAR 10.00</strong> payment.
Do not enter real card or bank details. This is not a customer purchase.</p>${detail}
<form method="post" action="/sandbox/payfast"><button type="submit">Create a new virtual-wallet test</button></form>
<p><a href="/admin/orders">Back to order administration</a></p>`);
}

export function sandboxRedirectForm(fields: [string, string][]) {
  return sandboxHtml(`<h1>Ready for the virtual wallet.</h1><p>You will leave Street Culture and open PayFast <strong>Sandbox</strong>.
The amount is ZAR 10.00 in virtual funds. No goods will be shipped.</p>
<form method="post" action="${PAYFAST_SANDBOX_PROCESS_URL}">${fields.map(([key, value]) =>
`<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`).join('')}
<button type="submit">Continue to PayFast Sandbox</button></form><p><a href="/sandbox/payfast">Back without paying</a></p>`);
}
