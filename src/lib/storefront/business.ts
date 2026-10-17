export const businessDetails = {
  tradingName: 'Street Culture',
  website: 'https://www.streetculturevault.com',
  operatingLocation: 'Maputo, Mozambique',
  checkoutCurrency: 'MZN',
  lastPolicyUpdate: '16 October 2026',
} as const;

export const supportDetails = {
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null,
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || null,
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '') || null,
} as const;

export function whatsappHref(message = 'Hello Street Culture, I need help with an order.') {
  if (!supportDetails.whatsapp) return null;
  return `https://wa.me/${supportDetails.whatsapp}?text=${encodeURIComponent(message)}`;
}
