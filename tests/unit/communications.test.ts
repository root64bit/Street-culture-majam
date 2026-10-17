// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Webhook } from 'standardwebhooks';
import { randomBytes } from 'node:crypto';
import { authEmailPayloadSchema, buildAuthEmails } from '@/lib/communications/auth-email';
import {
  campaignEmail,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from '@/lib/communications/newsletter';
import { sendEmail } from '@/lib/communications/email';
import { POST } from '@/app/api/hooks/auth-email/route';
import { safeAuthRedirect } from '@/lib/auth-redirect';
import { brandedEmail } from '@/lib/communications/templates';

describe('email contrast in dark-mode mail apps', () => {
  it('does not rely on body colour for the heading, message or OTP', () => {
    const { html } = brandedEmail({
      title: 'Confirm it’s you',
      message: 'Enter this code',
      code: '000000',
    });
    for (const tag of ['h1', 'div', 'p']) {
      const element = html.match(new RegExp('<' + tag + ' class="sc-(?:text|code)"[^>]+>'))?.[0];
      expect(element).toContain('color:#142219!important');
      expect(element).toContain('-webkit-text-fill-color:#142219!important');
    }
    expect(html).toContain('name="color-scheme" content="only light"');
    expect(html).toContain('bgcolor="#ffffff"');
  });
});

describe('safe auth destinations', () => {
  it('preserves internal checkout paths and rejects external redirects', () => {
    expect(safeAuthRedirect('/account?tab=orders')).toBe('/account?tab=orders');
    for (const path of [
      'https://evil.invalid',
      '//evil.invalid',
      '/\\evil.invalid',
      '/\nevil.invalid',
    ])
      expect(safeAuthRedirect(path)).toBe('/account');
  });
});

const store = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@/lib/communications/store', () => ({ communicationsAdmin: store.admin }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const user = {
  id: '991e51ea-4c62-4df6-a04d-945fe5b4bc06',
  email: 'old@example.com',
  new_email: 'new@example.com',
};
const payload = (type: string) =>
  authEmailPayloadSchema.parse({
    user,
    email_data: {
      email_action_type: type,
      token: '123456',
      token_hash: 'hash-old',
      token_new: '654321',
      token_hash_new: 'hash-new',
    },
  });

describe('branded authentication email', () => {
  it('includes a code and fixed-domain confirmation link', () => {
    const [email] = buildAuthEmails(payload('signup'), 'https://www.streetculturevault.com');
    expect(email.text).toContain('123456');
    expect(email.text).toContain(
      'https://www.streetculturevault.com/auth/confirm?token_hash=hash-old&type=signup'
    );
    expect(email.to).toBe(user.email);
  });
  it('maps Supabase secure email-change hashes to the correct addresses', () => {
    const emails = buildAuthEmails(payload('email_change'), 'https://www.streetculturevault.com');
    expect(emails[0].text).toContain('token_hash=hash-new');
    expect(emails[0].text).toContain('123456');
    expect(emails[1].to).toBe('new@example.com');
    expect(emails[1].text).toContain('token_hash=hash-old');
    expect(emails[1].text).toContain('654321');
  });
  it('fails visibly for unsupported email actions', () => {
    expect(() =>
      buildAuthEmails(payload('unknown'), 'https://www.streetculturevault.com')
    ).toThrow();
  });
});

describe('marketing consent tokens', () => {
  it('rejects forged and malformed unsubscribe requests', () => {
    vi.stubEnv('NEWSLETTER_SIGNING_SECRET', 'test-only-long-random-secret');
    const token = unsubscribeToken(user.id);
    expect(verifyUnsubscribeToken(token)).toBe(user.id);
    expect(verifyUnsubscribeToken(`${token}a`)).toBeNull();
    expect(verifyUnsubscribeToken(`invalid.${token.split('.')[1]}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${token}.extra`)).toBeNull();
  });
  it('requires a physical address and includes a one-click unsubscribe header', () => {
    vi.stubEnv('NEWSLETTER_SIGNING_SECRET', 'test-secret');
    vi.stubEnv('MARKETING_POSTAL_ADDRESS', '');
    expect(() => campaignEmail('Drop', 'New arrivals', user.id)).toThrow();
    vi.stubEnv('MARKETING_POSTAL_ADDRESS', '139 Queens Road, Johannesburg, 2092, South Africa');
    const email = campaignEmail('Drop <script>', 'Shop <b>new arrivals</b>', user.id);
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<b>new arrivals</b>');
    expect(email.text).toContain('139 Queens Road');
    expect(email.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('Twilio Email API', () => {
  it('sends only server-side credentials and the documented email payload', async () => {
    vi.stubEnv('TWILIO_API_KEY', 'test-key');
    vi.stubEnv('TWILIO_API_SECRET', 'test-secret');
    vi.stubEnv('TWILIO_EMAIL_FROM', 'support@example.com');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ operationId: 'operation-1' }), { status: 202 })
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await sendEmail({ to: user.email, subject: 'Code', html: '<p>123456</p>', text: '123456' })
    ).toBe('operation-1');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://comms.twilio.com/v1/Emails');
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from('test-key:test-secret').toString('base64')}`
    );
    expect(JSON.parse(options.body)).toMatchObject({
      from: { address: 'support@example.com' },
      to: [{ address: user.email }],
      content: { subject: 'Code' },
    });
  });
});

describe('Supabase hook protection', () => {
  it('rejects unsigned payloads before database or email calls', async () => {
    vi.stubEnv('SUPABASE_SEND_EMAIL_HOOK_SECRET', `v1,whsec_${randomBytes(32).toString('base64')}`);
    const response = await POST(
      new Request('https://www.streetculturevault.com/api/hooks/auth-email', {
        method: 'POST',
        body: JSON.stringify(payload('signup')),
      })
    );
    expect(response.status).toBe(401);
    expect(store.admin).not.toHaveBeenCalled();
  });
  it('accepts a correctly signed hook and records provider acceptance', async () => {
    const secret = `whsec_${randomBytes(32).toString('base64')}`;
    vi.stubEnv('SUPABASE_SEND_EMAIL_HOOK_SECRET', `v1,${secret}`);
    vi.stubEnv('TWILIO_API_KEY', 'test-key');
    vi.stubEnv('TWILIO_API_SECRET', 'test-secret');
    vi.stubEnv('TWILIO_EMAIL_FROM', 'support@example.com');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ operationId: 'op-1' }), { status: 202 }))
    );
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    store.admin.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }), update }),
    });
    const body = JSON.stringify(payload('signup'));
    const timestamp = new Date();
    const signature = new Webhook(secret).sign('evt-1', timestamp, body);
    const response = await POST(
      new Request('https://www.streetculturevault.com/api/hooks/auth-email', {
        method: 'POST',
        body,
        headers: {
          'webhook-id': 'evt-1',
          'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
          'webhook-signature': signature,
        },
      })
    );
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ status: 'accepted', operation_id: 'op-1' });
  });
});
