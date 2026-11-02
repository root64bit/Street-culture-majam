export const isolatedTestProject = 'street_culture_sprint1_test';

export function assertIsolatedTestEnvironment(env: Record<string, string | undefined>) {
  const configured = [
    'LOCAL_SUPABASE_TEST_URL',
    'LOCAL_SUPABASE_TEST_ANON_KEY',
    'LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY',
  ].some((name) => Boolean(env[name]));
  if (!configured) return false;
  if (
    env.SC_TEST_ISOLATION !== isolatedTestProject ||
    env.LOCAL_SUPABASE_TEST_URL !== 'http://127.0.0.1:55321' ||
    !env.LOCAL_SUPABASE_TEST_ANON_KEY ||
    !env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY
  )
    throw new Error(
      'Database tests require the isolated Sprint 1 project on 127.0.0.1:55321. Production/shared local targets are forbidden.'
    );
  for (const name of [
    'SQUARE_ACCESS_TOKEN',
    'TWILIO_API_SECRET',
    'TWILIO_AUTH_TOKEN',
    'INTERNET_EXPRESS_API_KEY',
    'api_internet_express_shipping',
  ]) {
    if (env[name])
      throw new Error('External provider credentials are forbidden in isolated database tests.');
  }
  if (env.MPESA_PAYMENTS_ENABLED === 'true' || env.SQUARE_PAYMENTS_ENABLED === 'true')
    throw new Error('Live payment adapters must be disabled for isolated database tests.');
  return true;
}
