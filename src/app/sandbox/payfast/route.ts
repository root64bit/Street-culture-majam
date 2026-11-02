import { randomBytes, randomUUID } from 'node:crypto';
import { adminApiClient } from '@/lib/admin/access';
import { hasSameRequestOrigin } from '@/lib/request-origin';
import { sandboxCheckoutFields, sandboxConfig, sandboxEnabled, SANDBOX_REFERENCE, tokenHash } from '@/lib/payments/payfast-sandbox';
import { createSandboxSession, getSandboxSession } from '@/lib/payments/payfast-sandbox-store';
import { sandboxHome, sandboxHtml, sandboxRedirectForm } from '@/lib/payments/payfast-sandbox-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function access() {
  if (!sandboxEnabled()) return sandboxHtml('<h1>Sandbox is not enabled.</h1>', 404);
  const auth = await adminApiClient();
  if ('error' in auth) {
    return sandboxHtml(`<h1>Administrator sign-in required.</h1><p>This test tool is not available to customer accounts.</p>
<a href="/auth/sign-in?redirectTo=%2Fsandbox%2Fpayfast">Sign in with your administrator account</a>`, auth.status);
  }
  return auth;
}

export async function GET(request: Request) {
  const auth = await access();
  if (auth instanceof Response) return auth;
  try {
    sandboxConfig();
    const url = new URL(request.url);
    const id = url.searchParams.get('session');
    if (!id) return sandboxHome();
    if (!SANDBOX_REFERENCE.test(`SC-SBX-${id}`)) return sandboxHtml('<h1>Test reference not found.</h1>', 404);
    const session = await getSandboxSession(id);
    if (!session) return sandboxHtml('<h1>Test reference not found.</h1>', 404);
    return sandboxHome(session, url.searchParams.has('cancelled'));
  } catch {
    return sandboxHtml('<h1>Sandbox is not ready yet.</h1><p>Test credentials or test storage are unavailable. No live payment was attempted.</p>', 503);
  }
}

export async function POST(request: Request) {
  if (!sandboxEnabled()) return sandboxHtml('<h1>Sandbox is not enabled.</h1>', 404);
  if (!hasSameRequestOrigin(request)) return sandboxHtml('<h1>Please open the Sandbox tool and try again.</h1>', 403);
  const auth = await access();
  if (auth instanceof Response) return auth;
  try {
    const id = randomUUID();
    const token = randomBytes(32).toString('hex');
    const fields = sandboxCheckoutFields(id, token);
    await createSandboxSession({ id, created_by: auth.user.id, callback_token_hash: tokenHash(token) });
    return sandboxRedirectForm(fields);
  } catch {
    return sandboxHtml('<h1>Could not start this Sandbox test.</h1><p>No live payment was attempted. Please try again after the test configuration is checked.</p>', 503);
  }
}
