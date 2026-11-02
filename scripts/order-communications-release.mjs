// Explicit, guarded release actions. Never sends a test message or backfills orders.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const project = 'tysibniisuobzpmnhwkf',
  container = 'supabase_db_street_culture_sprint1_test',
  checkoutRelease = process.env.SC_RELEASE_KIND === 'checkout-experience',
  rehearsal = checkoutRelease
    ? 'sc_checkout_rehearsal_20261019'
    : 'sc_communications_rehearsal_20261019';
const directory = resolve(
    checkoutRelease
      ? 'outputs/checkout-experience-release/20261019'
      : 'outputs/order-communications-release/20261019'
  ),
  cli = process.env.SC_SUPABASE_CLI || 'supabase';
const source = checkoutRelease
    ? '20261019200000_customer_address_book.sql'
    : '20261019180000_order_communications.sql',
  version = source.slice(0, 14),
  action = process.argv[2];
const beforeCount = checkoutRelease ? 63 : 62,
  approval = checkoutRelease ? 'approved-checkout-experience' : 'approved-future-order-emails';
if (checkoutRelease && ['configure-worker', 'activate', 'check-worker'].includes(action))
  throw new Error(
    'The checkout release must not reconfigure or reactivate existing notification channels'
  );
const vercel =
  'C:/Users/YUNI/AppData/Local/npm-cache/_npx/69f9afb961c37556/node_modules/vercel/dist/index.js';
mkdirSync(directory, { recursive: true });
const path = (name) => resolve(directory, name),
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const save = (name, value) =>
    writeFileSync(path(name), JSON.stringify(value, null, 2), { flag: 'wx' }),
  json = (name) => JSON.parse(readFileSync(path(name), 'utf8'));
if (readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== project)
  throw new Error('Unexpected production project');
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  );
const metadataQuery = readFileSync('scripts/verify-schema-parity.mjs', 'utf8')
  .match(/const query = `([\s\S]*?)`;/)?.[1]
  ?.trim()
  .replace(/;$/, '');
if (!metadataQuery?.startsWith('SELECT json_build_object('))
  throw new Error('Metadata query not found');
const tables = [
  'products',
  'listings',
  'orders',
  'order_items',
  'payments',
  'seller_payouts',
  'checkout_shipping_quotes',
  'checkout_payment_holds',
  'order_refund_requests',
  'newsletter_subscribers',
  'newsletter_campaigns',
  'newsletter_deliveries',
];
const business = `jsonb_build_object(${tables.map((table) => `'${table}',(SELECT jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),''))) FROM public.${table} t)`).join(',')})`;
const snapshot = `SELECT (${metadataQuery}) AS metadata,${business} AS business,(SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations) AS migrations`;
const migration = () =>
  `${readFileSync('supabase/migrations/' + source, 'utf8')}\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('${version}','${source.slice(15, -4)}');`;
function remote(sql, privateInput = false) {
  let args = [sql];
  if (privateInput || sql.length > 20000) {
    const file = path(`query-${randomBytes(6).toString('hex')}.private.sql`);
    writeFileSync(file, sql, { flag: 'wx' });
    args = ['--file', file];
  }
  return (
    JSON.parse(
      execFileSync(cli, ['db', 'query', '--linked', '--output', 'json', ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 30 * 1024 * 1024,
        timeout: 120000,
      })
    ).rows ?? []
  );
}
function local(sql, database = rehearsal) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      database,
      '-At',
    ],
    {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 30 * 1024 * 1024,
      timeout: 120000,
    }
  );
}
function requireSource() {
  if (hash(readFileSync('supabase/migrations/' + source)) !== json('source.json').sha256)
    throw new Error('Migration changed since backup');
}
function unchanged(current) {
  if (canonical(current) !== canonical(json('before.json').business))
    throw new Error('Business records changed since backup; refresh release evidence');
}
function expectedLedger(ledger, after = false) {
  const wanted = [...json('before.json').migrations, ...(after ? [version] : [])].sort();
  if (canonical(ledger) !== canonical(wanted)) throw new Error('Unexpected migration ledger');
}
try {
  if (action === 'inspect') {
    const before = remote('BEGIN READ ONLY;' + snapshot + ';COMMIT;')[0];
    if (before.migrations.length !== beforeCount || before.migrations.includes(version))
      throw new Error('Unexpected production schema count');
    save('before.json', before);
    save('source.json', { source, sha256: hash(readFileSync('supabase/migrations/' + source)) });
    console.log(
      JSON.stringify({
        project,
        migrations: beforeCount,
        businessTables: tables.length,
        productionWrites: 0,
      })
    );
  } else if (action === 'backup') {
    requireSource();
    const dump = path('production-before.dump');
    if (existsSync(dump)) throw new Error('Backup exists; will not overwrite');
    const raw = execFileSync(cli, ['db', 'dump', '--linked', '--dry-run'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    });
    const connection = {};
    for (const match of raw.matchAll(
      /^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)=(.+)$/gm
    )) {
      let value = match[2].trim();
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      )
        value = value.slice(1, -1);
      if (/[\r\n`$\\'"\s]/.test(value)) throw new Error('Unsupported connection quoting');
      connection[match[1]] = value;
    }
    if (
      Object.keys(connection).length !== 5 ||
      connection.PGDATABASE !== 'postgres' ||
      !`${connection.PGHOST}/${connection.PGUSER}`.includes(project)
    )
      throw new Error('Unexpected backup connection');
    const pooler = new URL(readFileSync('supabase/.temp/pooler-url', 'utf8').trim()),
      role = connection.PGUSER.split('.')[0];
    if (
      !pooler.hostname.endsWith('.pooler.supabase.com') ||
      pooler.port !== '5432' ||
      !decodeURIComponent(pooler.username).endsWith('.' + project) ||
      !/^(postgres|cli_login_postgres)$/.test(role)
    )
      throw new Error('Unexpected session pooler');
    connection.PGHOST = pooler.hostname;
    connection.PGPORT = '5432';
    connection.PGUSER = role + '.' + project;
    const fd = openSync(dump, 'wx');
    try {
      execFileSync(
        'docker',
        [
          'exec',
          ...Object.keys(connection).flatMap((key) => ['-e', key]),
          '-e',
          'PGSSLMODE=require',
          container,
          'pg_dump',
          '--format=custom',
          '--role=postgres',
          '--schema=public',
          '--schema=auth',
          '--schema=storage',
          '--schema=supabase_migrations',
        ],
        {
          env: { ...process.env, ...connection, PGCONNECT_TIMEOUT: '30' },
          stdio: ['ignore', fd, 'pipe'],
          timeout: 600000,
        }
      );
    } finally {
      closeSync(fd);
    }
    const bytes = readFileSync(dump);
    execFileSync('docker', ['exec', '-i', container, 'pg_restore', '--list'], {
      input: bytes,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    save('backup.json', {
      project,
      sha256: hash(bytes),
      bytes: bytes.length,
      createdAt: new Date().toISOString(),
      mediaBytesIncluded: false,
    });
    console.log(JSON.stringify({ backup: 'PASS', bytes: bytes.length, sha256: hash(bytes) }));
  } else if (action === 'rehearse') {
    requireSource();
    const bytes = readFileSync(path('production-before.dump'));
    if (hash(bytes) !== json('backup.json').sha256) throw new Error('Backup digest mismatch');
    local(`CREATE DATABASE ${rehearsal} TEMPLATE template0;`, 'postgres');
    local(
      'DROP SCHEMA public;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;'
    );
    const restored = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        container,
        'pg_restore',
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '--username=postgres',
        '--dbname=' + rehearsal,
      ],
      { input: bytes, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 120000 }
    );
    if (restored.status !== 0) {
      writeFileSync(path('restore-error.private.log'), restored.stderr ?? 'Restore failed');
      throw new Error('Restore failed; inspect private diagnostics');
    }
    unchanged(JSON.parse(local(`SELECT ${business};`)));
    local(
      `BEGIN;SET LOCAL lock_timeout='5s';${migration()}${checkoutRelease ? '' : 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;'}COMMIT;`
    );
    unchanged(JSON.parse(local(`SELECT ${business};`)));
    expectedLedger(
      JSON.parse(
        local(
          'SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations;'
        )
      ),
      true
    );
    const channels = JSON.parse(
      local('SELECT json_agg(enabled) FROM public.order_notification_channels;')
    );
    if (!checkoutRelease && channels.some(Boolean))
      throw new Error('New channels must remain disabled');
    save('rehearsal.json', {
      restore: 'PASS',
      migration: 'PASS',
      historicalBusinessUnchanged: true,
      sourceHash: json('source.json').sha256,
      database: rehearsal,
    });
    console.log(
      'Backup restore, additive migration and network extension rehearsal passed; no historical business changes.'
    );
  } else if (action === 'apply') {
    if (process.argv[3] !== approval) throw new Error('Specific owner approval required');
    requireSource();
    if (json('rehearsal.json').migration !== 'PASS') throw new Error('Restore rehearsal required');
    const current = remote('BEGIN READ ONLY;' + snapshot + ';COMMIT;')[0];
    unchanged(current.business);
    expectedLedger(current.migrations);
    const result = remote(
      `BEGIN;SET LOCAL ROLE postgres;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';${migration()}${checkoutRelease ? '' : 'CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;'}SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migrations,(SELECT count(*) FROM public.order_message_outbox) AS messages,${checkoutRelease ? '(SELECT count(*)=0 FROM public.customer_addresses) AS address_book_empty' : '(SELECT bool_and(NOT enabled) FROM public.order_notification_channels) AS channels_disabled'};COMMIT;`
    )[0];
    if (
      result.migrations !== beforeCount + 1 ||
      !(checkoutRelease ? result.address_book_empty : result.channels_disabled)
    )
      throw new Error('Migration outcome requires review; do not repeat');
    save('applied.json', result);
    console.log(JSON.stringify(result));
  } else if (action === 'verify') {
    const current = remote('BEGIN READ ONLY;' + snapshot + ';COMMIT;')[0];
    expectedLedger(current.migrations, true);
    unchanged(current.business);
    const clean = JSON.parse(local(metadataQuery, 'postgres'));
    clean.functions = clean.functions.filter(
      (row) => !row.signature.includes('sprint1_test_attestation')
    );
    const differences = Object.keys(current.metadata).filter(
      (key) => canonical(current.metadata[key]) !== canonical(clean[key])
    );
    const access = remote(
      checkoutRelease
        ? `SELECT NOT has_table_privilege('anon','public.customer_addresses','SELECT') AS anonymous_addresses_denied,NOT has_table_privilege('authenticated','public.customer_addresses','INSERT') AS direct_address_write_denied,NOT has_function_privilege('anon','public.customer_address_operate(text,jsonb)','EXECUTE') AS anonymous_address_rpc_denied,NOT has_function_privilege('service_role','public.customer_address_operate(text,jsonb)','EXECUTE') AS service_cannot_impersonate_customer;`
        : `SELECT NOT has_function_privilege('authenticated','public.claim_order_message(text)','EXECUTE') AS customer_claim_denied,NOT has_function_privilege('service_role','public.claim_order_email()','EXECUTE') AS old_worker_denied,NOT has_function_privilege('authenticated','public.wake_order_notifications()','EXECUTE') AS scheduler_denied,NOT has_table_privilege('anon','public.order_notification_channels','SELECT') AS anonymous_configuration_denied;`
    )[0];
    const result = { schemaDifferences: differences, businessUnchanged: true, access };
    save('verified.json', result);
    console.log(JSON.stringify(result));
    if (differences.length || Object.values(access).some((value) => value !== true))
      throw new Error('Release verification failed');
  } else if (action === 'configure-worker') {
    if (json('verified.json').schemaDifferences.length)
      throw new Error('Verified migration required');
    const secretPath = path('worker-secret.private');
    if (!existsSync(secretPath))
      writeFileSync(secretPath, randomBytes(32).toString('hex'), { flag: 'wx' });
    const secret = readFileSync(secretPath, 'utf8');
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid private worker key');
    for (const [name, value] of [
      ['ORDER_NOTIFICATION_WORKER_SECRET', secret],
      ['ORDER_EMAILS_ENABLED', 'true'],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          vercel,
          'env',
          'add',
          name,
          'production',
          '--force',
          '--yes',
          ...(name.endsWith('SECRET') ? ['--sensitive'] : []),
        ],
        { input: value + '\n', encoding: 'utf8' }
      );
      if (result.status !== 0)
        throw new Error('Vercel notification environment setup failed; no values logged');
    }
    remote(
      `BEGIN;DO $$BEGIN IF EXISTS(SELECT 1 FROM vault.secrets WHERE name='street_culture_order_worker') THEN RAISE EXCEPTION 'Worker secret already exists; reconcile before replacing';END IF;END$$;SELECT vault.create_secret('${secret}','street_culture_order_worker','Dedicated Vercel order notification worker');COMMIT;`,
      true
    );
    save('worker-configured.json', {
      vercelWorkerKey: true,
      vaultWorkerKey: true,
      channelsStillDisabled: true,
    });
    console.log('Dedicated notification worker key installed privately; no channel activated.');
  } else if (action === 'activate') {
    if (process.argv[3] !== 'approved-future-order-emails')
      throw new Error('Specific owner approval required');
    if (!existsSync(path('worker-checked.json')))
      throw new Error('Deployed empty worker check required');
    const result = remote(
      `BEGIN;SET LOCAL ROLE postgres;DO $$BEGIN IF EXISTS(SELECT 1 FROM public.order_notification_channels WHERE enabled) THEN RAISE EXCEPTION 'Channel already enabled; do not reset its cutoff';END IF;IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='street-culture-order-notifications') THEN RAISE EXCEPTION 'Scheduler already exists';END IF;END$$;UPDATE public.order_notification_channels SET enabled=TRUE,enabled_since=clock_timestamp(),updated_at=now() WHERE channel IN ('CUSTOMER_EMAIL','ADMIN_EMAIL');SELECT cron.schedule('street-culture-order-notifications','* * * * *','SELECT public.wake_order_notifications();');SELECT json_agg(json_build_object('channel',channel,'enabled',enabled,'enabled_since',enabled_since)) AS channels FROM public.order_notification_channels;COMMIT;`
    )[0];
    save('activation.json', result);
    console.log(JSON.stringify(result));
  } else if (action === 'check-worker') {
    const queue = remote('SELECT count(*) AS count FROM public.order_message_outbox;')[0];
    if (queue.count !== 0)
      throw new Error('Expected empty queue before activation; refusing any send test');
    const response = await fetch('https://www.streetculturevault.com/api/cron/orders', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + readFileSync(path('worker-secret.private'), 'utf8') },
      signal: AbortSignal.timeout(55000),
    });
    const result = await response.json();
    if (
      !response.ok ||
      result.skipped ||
      !result.results
        ?.flat()
        .every((value) => value.status === 'fulfilled' && value.value.empty === true)
    )
      throw new Error('Empty worker verification failed');
    save('worker-checked.json', {
      status: response.status,
      emptyQueue: true,
      noMessagesSent: true,
      checkedAt: new Date().toISOString(),
    });
    console.log('Live authenticated worker passed against an empty queue; no emails sent.');
  } else if (action === 'cleanup-rehearsal') {
    if (
      json('rehearsal.json').database !== rehearsal ||
      !existsSync(path(checkoutRelease ? 'live-smoke.json' : 'activation.json')) ||
      hash(readFileSync(path('production-before.dump'))) !== json('backup.json').sha256
    )
      throw new Error('Verified release and recoverable backup required');
    if (
      Number(
        local(
          `SELECT count(*) FROM pg_stat_activity WHERE datname='${rehearsal}';`,
          'postgres'
        ).trim()
      ) !== 0
    )
      throw new Error('Rehearsal is still in use');
    local(`DROP DATABASE ${rehearsal};`, 'postgres');
    save('cleanup.json', { removedOwnedTemporaryDatabase: rehearsal, backupRetained: true });
    console.log('Removed the owned temporary restored database; backup retained.');
  } else
    throw new Error(
      'Choose inspect, backup, rehearse, apply, verify, configure-worker, check-worker, activate or cleanup-rehearsal'
    );
} catch (error) {
  console.error(
    error instanceof Error && error.message && !('stderr' in error)
      ? error.message
      : 'Release action failed; no credentials or private rows logged.'
  );
  process.exitCode = 1;
}
