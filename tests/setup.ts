import '@testing-library/jest-dom/vitest';
import { assertIsolatedTestEnvironment } from './helpers/test-environment';
import { beforeAll } from 'vitest';
if (assertIsolatedTestEnvironment(process.env)) {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, options) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    );
    if (url.origin !== 'http://127.0.0.1:55321' && url.origin !== 'http://127.0.0.1:3031')
      throw new Error('Isolated tests refuse external network access.');
    return realFetch(input, { ...options, redirect: 'error' });
  };
  beforeAll(async () => {
    const response = await fetch(
      `${process.env.LOCAL_SUPABASE_TEST_URL}/rest/v1/rpc/sprint1_test_attestation`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );
    if (!response.ok || (await response.json()) !== 'street_culture_sprint1_test')
      throw new Error('Test database attestation missing: no mutations permitted.');
  });
}
