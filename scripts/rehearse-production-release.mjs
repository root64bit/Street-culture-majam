// Restore into a new, explicitly named local-only database, then rehearse the four upgrades.
// Never connects to production and never enables external services.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const container = 'supabase_db_street_culture_sprint1_test';
const database = 'sc_release_rehearsal_20261018_v2';
const path = 'outputs/sprint-1/backups/production-pre-release-pg17-complete.dump';
const backup = readFileSync(path);
const manifest = JSON.parse(
  readFileSync(
    'outputs/sprint-1/backups/production-pre-release-pg17-complete-manifest.json',
    'utf8'
  )
);
if (
  manifest.project !== 'tysibniisuobzpmnhwkf' ||
  createHash('sha256').update(backup).digest('hex') !== manifest.sha256
) {
  throw new Error('Backup verification failed');
}
const local = (sql, target = database) =>
  execFileSync(
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
      target,
      '-At',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
const stateQuery = `SELECT json_build_object(
 'products',(SELECT count(*) FROM public.products),
 'orders',(SELECT count(*) FROM public.orders),
 'payments',(SELECT count(*) FROM public.payments),
 'reserved_listings',(SELECT count(*) FROM public.listings WHERE status='RESERVED'),
 'product_hash',(SELECT md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY id),'')) FROM public.products p),
 'listing_hash',(SELECT md5(coalesce(string_agg(md5(to_jsonb(l)::text),'' ORDER BY id),'')) FROM public.listings l)
);`;
execFileSync('docker', ['inspect', '--format', '{{.Name}}', container], { stdio: 'ignore' });
local(`CREATE DATABASE ${database} TEMPLATE template0;`, 'postgres');
local(
  'DROP SCHEMA public; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;'
);
try {
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
      `--dbname=${database}`,
    ],
    { input: backup, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120000 }
  );
  if (restored.error || restored.status !== 0) {
    writeFileSync(
      'outputs/sprint-1/release/restore-error.private.log',
      restored.stderr ?? String(restored.error)
    );
    throw new Error('Restore failed');
  }
} catch (error) {
  writeFileSync(
    'outputs/sprint-1/release/restore-error.private.log',
    error.stderr ?? 'Restore failed'
  );
  throw new Error(
    'Local-only backup restore failed; private diagnostics saved, no production changes made'
  );
}
const before = JSON.parse(local(stateQuery));
const expected = JSON.parse(
  readFileSync('outputs/sprint-1/release/production-before.json', 'utf8')
).business_state;
for (const key of Object.keys(expected))
  if (expected[key] !== before[key]) throw new Error(`Backup snapshot mismatch: ${key}`);
const migrations = [
  '20261018170000_checkout_shipping_quotes.sql',
  '20261018180000_checkout_payment_release_safety.sql',
  '20261018190000_catalog_diagnostics_privacy.sql',
  '20261018200000_product_edit_workspace.sql',
];
for (const name of migrations) {
  const sql = readFileSync(`supabase/migrations/${name}`, 'utf8');
  const version = name.split('_')[0];
  const label = name.slice(15, -4).replaceAll("'", "''");
  local(
    `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';\n${sql}\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('${version}','${label}'); COMMIT;`
  );
}
const after = JSON.parse(local(stateQuery));
for (const key of Object.keys(before))
  if (before[key] !== after[key])
    throw new Error(`Rehearsal modified pre-existing business data: ${key}`);
const ledger = Number(local('SELECT count(*) FROM supabase_migrations.schema_migrations;').trim());
if (ledger !== 59) throw new Error('Unexpected rehearsed migration count');
const result = {
  container,
  database,
  restore: 'PASS',
  migrations: 'PASS',
  migrationCount: ledger,
  businessDataUnchanged: true,
  counts: { products: after.products, orders: after.orders, payments: after.payments },
  note: 'Rehearsal restores schema/data without ownership or ACL changes; production grants are checked independently by metadata comparison.',
};
writeFileSync('outputs/sprint-1/release/restore-rehearsal.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
