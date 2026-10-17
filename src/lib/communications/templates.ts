export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!;
  });
}

export function brandedEmail(input: {
  title: string;
  message: string;
  code?: string;
  button?: { label: string; url: string };
  footer?: string;
  unsubscribeUrl?: string;
}) {
  const { title, message, code, button, footer, unsubscribeUrl } = input;
  const safe = escapeEmailHtml;
  // Mail apps often discard <body> styles or replace inherited text with white
  // in dark mode. Put foreground colours on every text element, not just body.
  const ink = 'color:#142219!important;-webkit-text-fill-color:#142219!important;';
  const muted = 'color:#405046!important;-webkit-text-fill-color:#405046!important;';
  const green = 'color:#166534!important;-webkit-text-fill-color:#166534!important;';
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="only light"><meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<style>:root{color-scheme:light only;supported-color-schemes:light}
@media(prefers-color-scheme:dark){.sc-card{background-color:#ffffff!important}.sc-text,.sc-code{color:#142219!important;-webkit-text-fill-color:#142219!important}.sc-code{background-color:#edf5e8!important}.sc-muted{color:#405046!important;-webkit-text-fill-color:#405046!important}}
[data-ogsc] .sc-card{background-color:#ffffff!important}[data-ogsc] .sc-text,[data-ogsc] .sc-code{color:#142219!important;-webkit-text-fill-color:#142219!important}
</style></head>
<body style="margin:0;background-color:#f3f5f1;font-family:Arial,sans-serif;${ink}">
<table role="presentation" bgcolor="#f3f5f1" style="width:100%;border-collapse:collapse;background-color:#f3f5f1"><tr><td style="padding:32px 16px;${ink}">
<table role="presentation" class="sc-card" bgcolor="#ffffff" style="max-width:560px;width:100%;margin:auto;background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);border-radius:16px;border:1px solid #dce4dc;${ink}"><tr><td class="sc-card" bgcolor="#ffffff" style="padding:30px;border-radius:16px;background-color:#ffffff;${ink}">
<p style="font-family:Arial,sans-serif;font-size:13px;letter-spacing:3px;font-weight:bold;${green}">STREET CULTURE</p>
<h1 class="sc-text" style="font-family:Arial,sans-serif;font-size:25px;line-height:1.3;${ink}">${safe(title)}</h1>
<div class="sc-text" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.7;white-space:pre-line;${ink}">${safe(message)}</div>
${code ? `<p class="sc-code" style="padding:20px;background-color:#edf5e8;background-image:linear-gradient(#edf5e8,#edf5e8);border-radius:10px;font-family:Arial,sans-serif;font-size:32px;letter-spacing:6px;text-align:center;font-weight:bold;${ink}">${safe(code)}</p><p class="sc-muted" style="font-family:Arial,sans-serif;font-size:13px;line-height:1.6;${muted}">Use this code only on streetculturevault.com. Never share it with anyone.</p>` : ''}
${button ? `<p style="margin:28px 0;${ink}"><a href="${safe(button.url)}" style="display:inline-block;padding:14px 20px;background-color:#166534;background-image:linear-gradient(#166534,#166534);border-radius:8px;font-family:Arial,sans-serif;font-size:16px;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;text-decoration:none;font-weight:bold">${safe(button.label)}</a></p>` : ''}
<hr style="border:0;border-top:1px solid #d1d9d2;margin:28px 0">
<p class="sc-muted" style="font-family:Arial,sans-serif;font-size:13px;line-height:1.6;white-space:pre-line;${muted}">${safe(footer || 'If you did not request this email, you can ignore it. Need help? Contact support@streetculturevault.com.')}</p>
${unsubscribeUrl ? `<p style="font-family:Arial,sans-serif;font-size:13px;${ink}"><a href="${safe(unsubscribeUrl)}" style="${green}">Unsubscribe from marketing emails</a></p>` : ''}
<p class="sc-muted" style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:1px;${muted}">AUTHENTICITY IS THE CULTURE</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    title,
    message,
    code ? `Your verification code: ${code}` : '',
    button ? `${button.label}: ${button.url}` : '',
    footer ||
      'If you did not request this email, you can ignore it. Contact support@streetculturevault.com for help.',
    unsubscribeUrl ? `Unsubscribe: ${unsubscribeUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { html, text };
}
