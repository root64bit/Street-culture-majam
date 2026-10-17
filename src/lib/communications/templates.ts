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
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f5f1;font-family:Arial,sans-serif;color:#15231b"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:32px 16px"><table role="presentation" style="max-width:560px;width:100%;margin:auto;background:white;border-radius:16px;border:1px solid #dce4dc"><tr><td style="padding:30px"><p style="font-size:13px;letter-spacing:3px;font-weight:bold;color:#166534">STREET CULTURE</p><h1 style="font-size:25px;line-height:1.3">${safe(title)}</h1><div style="font-size:16px;line-height:1.7;white-space:pre-line">${safe(message)}</div>${code ? `<p style="padding:20px;background:#edf5e8;border-radius:10px;font-size:32px;letter-spacing:6px;text-align:center;font-weight:bold">${safe(code)}</p><p style="font-size:13px;color:#59665c">Use this code only on streetculturevault.com. Never share it with anyone.</p>` : ''}${button ? `<p style="margin:28px 0"><a href="${safe(button.url)}" style="display:inline-block;padding:14px 20px;background:#166534;border-radius:8px;color:white;text-decoration:none;font-weight:bold">${safe(button.label)}</a></p>` : ''}<hr style="border:0;border-top:1px solid #e4e9e2;margin:28px 0"><p style="font-size:12px;line-height:1.6;color:#69766c">${safe(footer || 'If you did not request this email, you can ignore it. Need help? Contact support@streetculturevault.com.')}</p>${unsubscribeUrl ? `<p style="font-size:12px"><a href="${safe(unsubscribeUrl)}" style="color:#166534">Unsubscribe from marketing emails</a></p>` : ''}<p style="font-size:11px;letter-spacing:1px;color:#829080">AUTHENTICITY IS THE CULTURE</p></td></tr></table></td></tr></table></body></html>`;
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
