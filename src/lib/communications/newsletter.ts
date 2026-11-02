import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { communicationsAdmin } from './store';
import { sendEmail } from './email';
import { brandedEmail } from './templates';

export const siteOrigin = () =>
  new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.streetculturevault.com').origin;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function unsubscribeToken(id: string) {
  const secret = process.env.NEWSLETTER_SIGNING_SECRET;
  if (!secret) throw new Error('Newsletter signing is not configured.');
  return `${id}.${createHmac('sha256', secret).update(`unsubscribe:${id}`).digest('base64url')}`;
}

export function verifyUnsubscribeToken(token: string) {
  const [id, signature, extra] = token.split('.');
  if (extra || !z.string().uuid().safeParse(id).success || !signature) return null;
  const expected = unsubscribeToken(id).split('.')[1];
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
    ? id
    : null;
}

export async function requestNewsletterSubscription(email: string) {
  const address = process.env.MARKETING_POSTAL_ADDRESS;
  if (!address) throw new Error('A business mailing address is required.');
  const admin = communicationsAdmin();
  const { data: existing, error } = await admin
    .from('newsletter_subscribers')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  if (error) throw new Error('Newsletter subscriptions are unavailable.');
  if (existing?.status === 'subscribed') return;
  if (
    existing?.confirmation_expires_at &&
    new Date(existing.confirmation_expires_at).getTime() > Date.now() + 23 * 60 * 60 * 1000
  )
    return;
  const token = randomBytes(32).toString('base64url');
  const values = {
    email,
    confirmation_hash: hashToken(token),
    confirmation_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    consent_version: 'newsletter-2026-10-17',
  };
  // Keep an existing unsubscribe effective until the recipient confirms again.
  const save = existing
    ? await admin.from('newsletter_subscribers').update(values).eq('id', existing.id)
    : await admin.from('newsletter_subscribers').insert({ ...values, status: 'pending' });
  if (save.error) throw new Error('Could not save this subscription request.');
  const confirm = new URL('/newsletter/confirm', siteOrigin());
  confirm.searchParams.set('token', token);
  const content = brandedEmail({
    title: 'Confirm your newsletter subscription',
    message:
      'You asked to receive Street Culture drops, new arrivals and offers. Confirm below to join the newsletter. Your account and order emails are separate.',
    button: { label: 'Confirm subscription', url: confirm.href },
    footer: `Street Culture · ${address}\nIf you did not ask to subscribe, ignore this email. You will not be added to the mailing list.`,
  });
  try {
    await sendEmail({
      to: email,
      subject: 'Confirm your Street Culture newsletter subscription',
      ...content,
      category: 'newsletter',
    });
  } catch (sendError) {
    // Make a later retry possible without changing a previous unsubscribe.
    await admin
      .from('newsletter_subscribers')
      .update({ confirmation_expires_at: null })
      .eq('email', email)
      .eq('confirmation_hash', hashToken(token));
    throw sendError;
  }
}

export async function confirmNewsletter(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const { data, error } = await communicationsAdmin()
    .from('newsletter_subscribers')
    .update({
      status: 'subscribed',
      confirmed_at: new Date().toISOString(),
      unsubscribed_at: null,
      confirmation_hash: null,
      confirmation_expires_at: null,
    })
    .eq('confirmation_hash', hashToken(token))
    .gt('confirmation_expires_at', new Date().toISOString())
    .select('id');
  if (error) throw new Error('Subscription confirmation is unavailable.');
  return Boolean(data?.length);
}

export async function unsubscribeNewsletter(token: string) {
  const id = verifyUnsubscribeToken(token);
  if (!id) return false;
  const { error } = await communicationsAdmin()
    .from('newsletter_subscribers')
    .update({
      status: 'unsubscribed',
      unsubscribed_at: new Date().toISOString(),
      confirmation_hash: null,
      confirmation_expires_at: null,
    })
    .eq('id', id);
  if (error) throw new Error('Unsubscribe is temporarily unavailable.');
  return true;
}

export function campaignEmail(subject: string, body: string, id: string) {
  const address = process.env.MARKETING_POSTAL_ADDRESS;
  if (!address)
    throw new Error('A business mailing address is required before campaigns can be sent.');
  const url = new URL('/api/newsletter/unsubscribe', siteOrigin());
  url.searchParams.set('token', unsubscribeToken(id));
  const content = brandedEmail({
    title: subject,
    message: body,
    button: { label: 'Explore Street Culture', url: `${siteOrigin()}/shop` },
    footer: `You’re receiving this email because you confirmed your Street Culture newsletter subscription.\nStreet Culture · ${address}\nContact support@streetculturevault.com`,
    unsubscribeUrl: url.href,
  });
  return {
    ...content,
    headers: {
      'List-Unsubscribe': `<${url.href}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
