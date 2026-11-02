import { cpSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFixtures } from './sprint1-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = resolve(root, 'outputs/sprint-1/environment');
const project = 'street_culture_sprint1_test';
const cli = process.env.SC_SUPABASE_CLI || 'supabase';
const action = process.argv[2];
function command(binary, args) {
  return execFileSync(binary, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
function status() {
  const result = JSON.parse(command(cli, ['status', '--workdir', workspace, '-o', 'json']));
  if (result.API_URL !== 'http://127.0.0.1:55321' || !result.SERVICE_ROLE_KEY || !result.ANON_KEY)
    throw new Error('Refusing an unexpected test stack.');
  const container = command('docker', [
    'inspect',
    '--format',
    '{{.Name}}',
    `supabase_db_${project}`,
  ]).trim();
  if (container !== `/supabase_db_${project}`)
    throw new Error('Test database container not verified.');
  return result;
}
function isolatedEnvironment(value) {
  // Allowlist, not a merge with .env.local or cloud provider credentials.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(PATH|Path|PATHEXT|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|ComSpec|CI|NUMBER_OF_PROCESSORS)$/i.test(
        key
      )
    )
  );
  return {
    ...env,
    SC_TEST_ISOLATION: project,
    LOCAL_SUPABASE_TEST_URL: value.API_URL,
    LOCAL_SUPABASE_TEST_ANON_KEY: value.ANON_KEY,
    LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY: value.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: value.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: value.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: value.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3031',
    MPESA_PAYMENTS_ENABLED: 'false',
    SQUARE_PAYMENTS_ENABLED: 'false',
    NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED: 'false',
    NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED: 'false',
    NEXT_PUBLIC_EMAIL_OTP_ENABLED: 'false',
    NEXT_PUBLIC_PHONE_OTP_ENABLED: 'false',
    NEXT_PUBLIC_NEWSLETTER_ENABLED: 'false',
    ORDER_EMAILS_ENABLED: 'false',
    FULFILLMENT_API_BOOKING_ENABLED: 'false',
    SC_EXTERNAL_SERVICES: 'disabled',
    TWILIO_API_KEY: '',
    TWILIO_API_SECRET: '',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    INTERNET_EXPRESS_API_KEY: '',
    api_internet_express_shipping: '',
    SQUARE_ACCESS_TOKEN: '',
    SUPABASE_SEND_EMAIL_HOOK_SECRET: '',
    NEWSLETTER_SIGNING_SECRET: '',
    SQUARE_ENVIRONMENT: 'sandbox',
  };
}
try {
  if (action === 'prepare') {
    mkdirSync(resolve(workspace, 'supabase'), { recursive: true });
    cpSync(resolve(root, 'supabase/test.config.toml'), resolve(workspace, 'supabase/config.toml'));
    cpSync(resolve(root, 'supabase/migrations'), resolve(workspace, 'supabase/migrations'), {
      recursive: true,
    });
    console.log(
      'Prepared canonical migrations for the isolated test project; no seed or cloud link copied.'
    );
  } else if (action === 'start') {
    if (!existsSync(resolve(workspace, 'supabase/config.toml')))
      throw new Error('Run prepare first.');
    command(cli, [
      'start',
      '--workdir',
      workspace,
      '-x',
      'studio,postgres-meta,imgproxy,realtime,edge-runtime,logflare,vector,supavisor',
    ]);
    status();
    console.log(
      'Isolated Supabase started on loopback test ports 55321/55322. Credentials withheld.'
    );
  } else if (action === 'reset-disposable') {
    status();
    if (process.argv[3] !== project)
      throw new Error('Explicit disposable project confirmation required.');
    cpSync(resolve(root, 'supabase/migrations'), resolve(workspace, 'supabase/migrations'), {
      recursive: true,
    });
    command(cli, ['db', 'reset', '--local', '--no-seed', '--workdir', workspace, '--yes']);
    console.log('Rebuilt ONLY the explicitly named disposable project from canonical migrations.');
  } else if (action === 'migrate') {
    status();
    cpSync(resolve(root, 'supabase/migrations'), resolve(workspace, 'supabase/migrations'), {
      recursive: true,
    });
    command(cli, ['db', 'push', '--local', '--workdir', workspace, '--yes']);
    console.log('Applied only pending migrations to the isolated test project.');
  } else if (action === 'status') {
    status();
    console.log(
      'Verified isolated project, container and API URL. No provider credentials loaded.'
    );
  } else if (action === 'fixtures') {
    const config = status();
    command('docker', [
      'exec',
      `supabase_db_${project}`,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      "DROP FUNCTION IF EXISTS public.sprint1_test_attestation(); NOTIFY pgrst,'reload schema';",
    ]);
    // Never attest a partially installed fixture set or a still-restarting API.
    await installFixtures(isolatedEnvironment(config));
    command('docker', [
      'exec',
      '-i',
      `supabase_db_${project}`,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE OR REPLACE FUNCTION public.sprint1_test_attestation() RETURNS text LANGUAGE sql SET search_path='' AS $$
       SELECT CASE WHEN EXISTS(SELECT 1 FROM public.products WHERE id='d0000000-0000-0000-0000-000000000001')
        AND EXISTS(SELECT 1 FROM public.product_variants WHERE id='f0000000-0000-0000-0000-000000000001')
        AND EXISTS(SELECT 1 FROM public.shipping_methods WHERE id='a0000000-0000-0000-0000-000000000001' AND price=125.25)
        AND EXISTS(SELECT 1 FROM public.listings WHERE id='e0000000-0000-0000-0000-000000000001' AND asking_price=78)
        AND EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='product-images' AND name='d0000000-0000-0000-0000-000000000001/isolated.png')
        THEN 'street_culture_sprint1_test' ELSE 'FIXTURES_NOT_READY' END::text $$;
       REVOKE ALL ON FUNCTION public.sprint1_test_attestation() FROM PUBLIC,anon,authenticated;
       GRANT EXECUTE ON FUNCTION public.sprint1_test_attestation() TO service_role; NOTIFY pgrst,'reload schema';`,
    ]);
  } else if (action === 'test' || action === 'serve' || action === 'build') {
    const config = status();
    const env = isolatedEnvironment(config);
    if (action === 'serve' && process.argv[3] === '--review-ui') {
      // Display payment choices for local visual QA only. All server payment
      // flags stay FALSE and every external provider is independently blocked.
      env.NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED = 'true';
      env.NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED = 'true';
    }
    const args =
      action === 'test'
        ? [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', ...process.argv.slice(3)]
        : action === 'build'
          ? [resolve(root, 'node_modules/next/dist/bin/next'), 'build']
          : [
              resolve(root, 'node_modules/next/dist/bin/next'),
              'dev',
              '-H',
              '127.0.0.1',
              '-p',
              '3031',
            ];
    const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  } else
    throw new Error(
      'Use prepare, start, migrate, status, fixtures, test, serve, build or reset-disposable with the exact project confirmation.'
    );
} catch (error) {
  // CLI errors may include environment values. Never echo captured stdout/stderr.
  console.error(
    error instanceof Error ? error.message.split('\n')[0] : 'Isolated environment operation failed.'
  );
  process.exitCode = 1;
}
