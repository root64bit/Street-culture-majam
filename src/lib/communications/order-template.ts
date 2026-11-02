import { escapeEmailHtml as safe } from './templates';
export type OrderEmailDesign = {
  audience: 'customer' | 'admin';
  kind: 'ORDER_CONFIRMED' | 'ORDER_SHIPPED' | 'ORDER_DELIVERED' | 'ADMIN_NEW_ORDER';
  orderNumber: string;
  orderUrl: string;
  customerName?: string;
  items: { name: string; size: string; quantity: number; price: string }[];
  subtotal: string;
  delivery: string;
  total: string;
  payments: string[];
  service: string;
  address: string[];
};
const ink = 'color:#111b15!important;-webkit-text-fill-color:#111b15!important;';
const muted = 'color:#48584e!important;-webkit-text-fill-color:#48584e!important;';
const white = 'background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);';
const text = (value: string) => safe(value).replace(/\r?\n/g, '<br>');
export function orderEmail(input: OrderEmailDesign) {
  const admin = input.audience === 'admin',
    shipped = input.kind === 'ORDER_SHIPPED',
    delivered = input.kind === 'ORDER_DELIVERED';
  const title = admin
    ? 'A new order just landed.'
    : delivered
      ? 'Delivered. Enjoy your piece.'
      : shipped
        ? 'Your piece is on its way.'
        : 'Good choice. It’s confirmed.';
  const badge = admin
    ? 'PAID ORDER · ACTION REQUIRED'
    : delivered
      ? 'DELIVERY CONFIRMED'
      : shipped
        ? 'HANDED TO THE COURIER'
        : 'PAYMENT RECEIVED';
  const intro = admin
    ? 'A verified payment is in. Review this order and prepare the next step.'
    : delivered
      ? 'Your delivery has been confirmed. Thanks for shopping Street Culture.'
      : shipped
        ? 'Your parcel has been handed over. Follow its progress from your private order page.'
        : 'Thanks for shopping Street Culture. Your payment is confirmed and our team will check and prepare your order.';
  const next = admin
    ? 'Check the delivery address, verify and pack the items, then approve fulfillment. Payment confirmation does not book a courier or schedule collection.'
    : shipped || delivered
      ? 'View your private order page for the latest delivery status. Contact our team if you need help.'
      : 'We’ll check and prepare your order, then email you when it is handed over. A confirmed order does not mean it has shipped.';
  const access = admin
    ? 'This button requires your authorized staff account. If another account is signed in, use the account-switching option on the access screen.'
    : 'Open this link in the original checkout browser, or sign in to the account used at checkout. Guest purchases on another device may need help from support.';
  const label = admin ? 'Review paid order' : 'View your order';
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:7px 0;font-size:${strong ? '18' : '14'}px;${ink}${strong ? 'font-weight:bold;' : ''}">${safe(label)}</td><td align="right" style="padding:7px 0;font-size:${strong ? '20' : '14'}px;${ink}${strong ? 'font-weight:bold;' : ''}">${safe(value)}</td></tr>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="only light"><meta name="supported-color-schemes" content="light"><meta name="x-apple-disable-message-reformatting"><style>:root{color-scheme:light only}.sc-order-ink{${ink}}.sc-order-muted{${muted}}@media(max-width:480px){.sc-order-pad{padding:24px!important}.sc-order-title{font-size:30px!important}}@media(prefers-color-scheme:dark){.sc-order-white{${white}}.sc-order-ink{${ink}}.sc-order-muted{${muted}}}</style></head>
 <body style="margin:0;background-color:#edf0e9;font-family:Arial,Helvetica,sans-serif;${ink}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${safe(badge)} — ${safe(input.orderNumber)}. ${safe(intro)}</div>
 <table role="presentation" width="100%" bgcolor="#edf0e9" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;${white}border:1px solid #dce2d7;border-radius:22px;overflow:hidden">
 <tr><td bgcolor="#c8ff00" style="padding:23px 30px;background-color:#c8ff00;background-image:linear-gradient(#c8ff00,#c8ff00);${ink}"><p style="margin:0;font-size:21px;font-weight:900;letter-spacing:2px;${ink}">STREET CULTURE</p><p style="margin:6px 0 0;font-size:10px;font-weight:bold;letter-spacing:3px;${ink}">AUTHENTICITY IS THE CULTURE</p></td></tr>
 <tr><td class="sc-order-pad sc-order-white" bgcolor="#ffffff" style="padding:32px;${white}">
 <p class="sc-order-ink" style="margin:0 0 18px;font-size:10px;letter-spacing:2px;font-weight:bold;${ink}">${safe(badge)}</p>
 <h1 class="sc-order-title sc-order-ink" style="margin:0 0 16px;font-size:36px;line-height:1.12;letter-spacing:-1px;${ink}">${safe(title)}</h1>
 <p class="sc-order-muted" style="margin:0 0 22px;font-size:15px;line-height:1.7;${muted}">${safe(intro)}</p>
 <p style="margin:0 0 24px;padding:12px 16px;border:1px solid #ccd7bf;border-radius:10px;font-size:13px;font-weight:bold;${ink}">ORDER ${safe(input.orderNumber)}</p>
 <h2 style="margin:0 0 12px;font-size:11px;letter-spacing:2px;${ink}">${admin ? 'ITEMS TO PREPARE' : 'YOUR PIECES'}</h2>
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${input.items.map((item) => `<tr><td style="padding:16px 0;border-bottom:1px solid #e0e5dd;${ink}"><p style="margin:0;font-size:15px;font-weight:bold;line-height:1.5;${ink}">${safe(item.name)}</p><p style="margin:5px 0 0;font-size:12px;${muted}">${safe(item.size)} · Qty ${safe(String(item.quantity))}</p></td><td align="right" valign="top" style="padding:18px 0 16px 14px;border-bottom:1px solid #e0e5dd;font-size:14px;white-space:nowrap;${ink}">${safe(item.price)}</td></tr>`).join('')}</table>
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0 20px">${row('Subtotal', input.subtotal)}${row('Delivery', input.delivery)}${row('Order total', input.total, true)}</table>
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td bgcolor="#eff7dd" style="padding:18px;border-radius:12px;background-color:#eff7dd;background-image:linear-gradient(#eff7dd,#eff7dd);${ink}"><p style="margin:0;font-size:10px;letter-spacing:1.5px;font-weight:bold;${ink}">PAYMENT RECEIVED</p><p style="margin:8px 0;font-size:21px;font-weight:bold;${ink}">${input.payments.map(safe).join('<br>') || 'Payment confirmed'}</p><p style="margin:0;font-size:12px;line-height:1.6;${muted}">This is the charge, not an additional payment request. A different payment currency reflects the locked checkout conversion.</p></td></tr></table>
 <h2 style="margin:28px 0 12px;font-size:11px;letter-spacing:2px;${ink}">DELIVERY DETAILS</h2><p style="margin:0 0 9px;font-size:14px;font-weight:bold;${ink}">${safe(input.service)}</p><p style="margin:0;font-size:14px;line-height:1.75;${ink}">${input.address.map(text).join('<br>')}</p>
 <h2 style="margin:28px 0 10px;font-size:11px;letter-spacing:2px;${ink}">WHAT HAPPENS NEXT</h2><p style="margin:0;font-size:14px;line-height:1.75;${muted}">${safe(next)}</p>
 <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:26px 0 16px"><tr><td align="center" bgcolor="#c8ff00" style="border-radius:12px;background-color:#c8ff00;background-image:linear-gradient(#c8ff00,#c8ff00)"><a href="${safe(input.orderUrl)}" style="display:block;padding:18px 20px;font-size:15px;font-weight:bold;text-decoration:none;${ink}">${safe(label)} &rarr;</a></td></tr></table>
 <p style="margin:0;font-size:12px;line-height:1.65;${muted}">${safe(access)}</p>
 <hr style="border:0;border-top:1px solid #dde4d8;margin:28px 0 20px"><p style="margin:0;font-size:13px;font-weight:bold;${ink}">Need a hand?</p><p style="margin:8px 0;font-size:12px;line-height:1.8;${muted}"><a href="mailto:support@streetculturevault.com" style="${ink}">support@streetculturevault.com</a><br>WhatsApp +27 66 548 8223</p><p style="margin:14px 0 0;font-size:11px;line-height:1.7;${muted}">This is an order update, not a marketing subscription.</p>
 </td></tr></table></td></tr></table></body></html>`;
  const plain = [
    title,
    badge,
    `Order ${input.orderNumber}`,
    intro,
    input.items
      .map((item) => `${item.quantity} × ${item.name} · ${item.size} · ${item.price}`)
      .join('\n'),
    `Subtotal: ${input.subtotal}\nDelivery: ${input.delivery}\nOrder total: ${input.total}`,
    `Payment received: ${input.payments.join(', ') || 'Confirmed'}. This is the charge, not an additional payment request.`,
    `Delivery service: ${input.service}\n${input.address.join('\n')}`,
    next,
    `${label}: ${input.orderUrl}`,
    access,
    'Need help? support@streetculturevault.com · WhatsApp +27 66 548 8223. This is an order update, not a marketing subscription.',
  ].join('\n\n');
  return { html, text: plain };
}
