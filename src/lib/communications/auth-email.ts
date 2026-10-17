import { z } from 'zod';
import { brandedEmail } from './templates';

export const authEmailPayloadSchema = z.object({
  user: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      new_email: z.string().email().nullable().optional(),
    })
    .passthrough(),
  email_data: z
    .object({
      email_action_type: z.string(),
      token: z.string().default(''),
      token_hash: z.string().default(''),
      token_new: z.string().default(''),
      token_hash_new: z.string().default(''),
    })
    .passthrough(),
});

export function buildAuthEmails(payload: z.infer<typeof authEmailPayloadSchema>, siteUrl: string) {
  const site = new URL(siteUrl);
  const data = payload.email_data;
  const action = data.email_action_type;
  const descriptions: Record<string, { title: string; message: string; label: string }> = {
    signup: {
      title: 'Verify your email',
      message:
        'Welcome to Street Culture. Enter this code on the website to finish creating your account.',
      label: 'Confirm email',
    },
    magiclink: {
      title: 'Your sign-in code',
      message: 'Enter this one-time code to sign in to your Street Culture account.',
      label: 'Sign in to Street Culture',
    },
    recovery: {
      title: 'Reset your password',
      message: 'Use the link below to choose a new password for your Street Culture account.',
      label: 'Reset password',
    },
    invite: {
      title: 'You’re invited to Street Culture',
      message: 'Confirm your email to accept your Street Culture invitation.',
      label: 'Accept invitation',
    },
    email_change: {
      title: 'Confirm your email change',
      message:
        'Confirm this address to complete the email change requested for your Street Culture account.',
      label: 'Confirm email change',
    },
    reauthentication: {
      title: 'Confirm it’s you',
      message: 'Enter this code on Street Culture to confirm the requested account action.',
      label: 'Open your account',
    },
  };
  const description = descriptions[action];
  if (!description) {
    // Never silently drop a new authentication action when the provider changes.
    throw new Error('Unsupported authentication email action.');
  }

  function create(to: string, token: string, hash: string) {
    if (!token) throw new Error('Missing authentication code.');
    const url = new URL('/auth/confirm', site.origin);
    url.searchParams.set('token_hash', hash);
    url.searchParams.set('type', action);
    if (action === 'recovery' || action === 'invite')
      url.searchParams.set('next', '/auth/reset-password');
    const content = brandedEmail({
      title: description.title,
      message: description.message,
      code: action === 'recovery' ? undefined : token,
      button:
        hash && action !== 'reauthentication'
          ? { label: description.label, url: url.href }
          : undefined,
    });
    return { to, subject: `${description.title} — Street Culture`, ...content };
  }

  if (action === 'email_change') {
    if (!payload.user.new_email) throw new Error('Missing new email address.');
    if (data.token_hash_new && data.token_hash && data.token && data.token_new) {
      // Supabase's backwards-compatible field names reverse the token hashes.
      return [
        create(payload.user.email, data.token, data.token_hash_new),
        create(payload.user.new_email, data.token_new, data.token_hash),
      ];
    }
    return [create(payload.user.new_email, data.token_new || data.token, data.token_hash)];
  }
  return [create(payload.user.email, data.token, data.token_hash)];
}
