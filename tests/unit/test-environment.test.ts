import { describe, expect, it } from 'vitest';
import { assertIsolatedTestEnvironment } from '../helpers/test-environment';
const valid = {
  SC_TEST_ISOLATION: 'street_culture_sprint1_test',
  LOCAL_SUPABASE_TEST_URL: 'http://127.0.0.1:55321',
  LOCAL_SUPABASE_TEST_ANON_KEY: 'isolated-anon',
  LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY: 'isolated-service',
};
describe('database test safety fence', () => {
  it('allows unconfigured unit tests and the isolated stack', () => {
    expect(assertIsolatedTestEnvironment({})).toBe(false);
    expect(assertIsolatedTestEnvironment(valid)).toBe(true);
  });
  it.each([
    'https://tysibniisuobzpmnhwkf.supabase.co',
    'http://127.0.0.1:54321',
    'http://localhost:55321',
    'http://127.0.0.1:55321@evil.invalid',
  ])('refuses target %s', (url) => {
    expect(() =>
      assertIsolatedTestEnvironment({ ...valid, LOCAL_SUPABASE_TEST_URL: url })
    ).toThrow();
  });
  it('refuses missing attestation, partial keys and live provider credentials', () => {
    for (const changes of [
      { SC_TEST_ISOLATION: '' },
      { LOCAL_SUPABASE_TEST_ANON_KEY: '' },
      { SQUARE_ACCESS_TOKEN: 'not-allowed' },
      { MPESA_PAYMENTS_ENABLED: 'true' },
    ])
      expect(() => assertIsolatedTestEnvironment({ ...valid, ...changes })).toThrow();
  });
});
