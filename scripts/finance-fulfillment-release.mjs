// Guarded release actions. Backups and private diagnostics are excluded from deployment.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = 'tysibniisuobzpmnhwkf';
const container = 'supabase_db_street_culture_sprint1_test';
const rehearsal = 'sc_finance_rehearsal_20261019';
const directory = resolve('outputs/finance-fulfillment-release/20261019');
const cli = process.env.SC_SUPABASE_CLI || 'supabase';
const names = [
  '20261019150000_finance_workspace.sql',
  '20261019151000_fulfillment_workspace.sql',
  '20261019152000_private_inventory_costs.sql',
];
const action = process.argv[2];
mkdirSync(directory, { recursive: true });
const path = (name) => resolve(directory, name);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (name) => JSON.parse(readFileSync(path(name), 'utf8'));
const save = (name, value) => writeFileSync(path(name), JSON.stringify(value, null, 2), { flag: 'wx' });
const sources = () => names.map((name) => ({ name, sha256: hash(readFileSync(`supabase/migrations/${name}`)) }));
if (readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== project) throw new Error('Wrong linked project');
const schemaSource = readFileSync('scripts/verify-schema-parity.mjs', 'utf8');
const metadataQuery = schemaSource.match(/const query = `([\s\S]*?)`;/)?.[1]?.trim().replace(/;$/, '');
if (!metadataQuery?.startsWith('SELECT json_build_object(')) throw new Error('Metadata query missing');
const tables = ['products', 'listings', 'orders', 'order_items', 'payments', 'seller_payouts', 'checkout_shipping_quotes', 'checkout_payment_holds', 'order_refund_requests'];
const stateExpr = `jsonb_build_object(${tables.map((name) => { const row = `(to_jsonb(t)${name === 'order_items' ? "-'ownership_type_snapshot'" : ''})::text`; return `'${name}',(SELECT jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(md5(${row}),'' ORDER BY ${row}),''))) FROM public.${name} t)`; }).join(',')})`;
const snapshotSql = `BEGIN READ ONLY; SELECT (${metadataQuery}) AS metadata, ${stateExpr} AS business,
 (SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations) AS migrations; COMMIT;`;
function remote(sql) {
  let queryArguments = [sql];
  if (sql.length > 20000) {
    const generated = path('approved-migrations.generated.sql');
    // Mechanical concatenation of the rehearsed, digest-checked migrations.
    // The CLI file option avoids the Windows command-line size limit.
    writeFileSync(generated, sql, {flag:'wx'});
    queryArguments = ['--file',generated];
  }
  const raw = execFileSync(cli, ['db', 'query', '--linked', '--output', 'json', ...queryArguments], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
  return JSON.parse(raw).rows ?? [];
}
function local(sql, database = rehearsal) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-At'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
}
function ledgerCheck(migrations, upgraded) {
  const expected = json('before.json').migrations;
  const wanted = upgraded ? [...expected, ...names.map((name) => name.slice(0, 14))].sort() : expected;
  if (JSON.stringify(migrations) !== JSON.stringify(wanted)) throw new Error('Unexpected migration ledger; no automatic repair');
}
const upgradesSql = () => names.map((name) => `${readFileSync(`supabase/migrations/${name}`, 'utf8')}\nINSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('${name.slice(0,14)}','${name.slice(15,-4)}');`).join('\n');
function summaryDifferences(a, b) {
  const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map((key)=>[key,item[key]])) : item);
  return Object.keys(a).filter((key) => canonical(a[key]) !== canonical(b[key]));
}
try {
  if (action === 'inspect') {
    const before = remote(snapshotSql)[0];
    if (before.migrations.length !== 59 || names.some((name) => before.migrations.includes(name.slice(0,14)))) throw new Error('Expected existing 59-migration release');
    save('before.json', before); save('source-hashes.json', sources());
    console.log(JSON.stringify({ project, migrations: before.migrations.length, criticalTables: tables.length, pending: names, productionWrites: 0 }));
  } else if (action === 'compare-restored') {
    const restored = JSON.parse(local(`SELECT ${stateExpr};`));
    const current = remote(snapshotSql)[0];
    const captured = json('before.json').business;
    const comparison = {restoredVsCaptured:summaryDifferences(restored,captured),currentVsCaptured:summaryDifferences(current.business,captured),restoredVsCurrent:summaryDifferences(restored,current.business),counts:Object.fromEntries(tables.map((name)=>[name,{captured:captured[name].count,restored:restored[name].count,current:current.business[name].count}]))};
    console.log(JSON.stringify(comparison));
  } else if (action === 'backup') {
    const before = json('before.json'); ledgerCheck(before.migrations, false);
    const dumpPath = path('production-before-pooler.dump');
    if (existsSync(dumpPath)) throw new Error('Backup already exists; refusing overwrite');
    const raw = execFileSync(cli, ['db', 'dump', '--linked', '--dry-run'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 5 * 1024 * 1024 });
    const connection = {};
    for (const match of raw.matchAll(/^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)=(.+)$/gm)) {
      let value = match[2].trim();
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1,-1);
      if (/[\r\n`$\\'"\s]/.test(value)) throw new Error('Unsupported connection quoting');
      connection[match[1]] = value;
    }
    if (Object.keys(connection).length !== 5 || connection.PGDATABASE !== 'postgres' || !['5432','6543'].includes(connection.PGPORT) || (!connection.PGHOST.endsWith('.supabase.co') && !connection.PGHOST.endsWith('.pooler.supabase.com')) || !`${connection.PGHOST}/${connection.PGUSER}`.includes(project)) throw new Error('Unexpected backup connection');
    // Docker has no IPv6 route to the direct database host. Use only the
    // project's saved session-pooler host, with the fresh CLI login-role password.
    const pooler = new URL(readFileSync('supabase/.temp/pooler-url','utf8').trim());
    if (!pooler.hostname.endsWith('.pooler.supabase.com') || pooler.port !== '5432' || !decodeURIComponent(pooler.username).endsWith(`.${project}`)) throw new Error('Unexpected session pooler');
    const role = connection.PGUSER.split('.')[0];
    if (!/^(postgres|cli_login_postgres)$/.test(role)) throw new Error('Unexpected backup login role');
    connection.PGHOST = pooler.hostname; connection.PGPORT = '5432'; connection.PGUSER = `${role}.${project}`;
    execFileSync('docker', ['inspect','--format','{{.Name}}',container], { stdio:'ignore' });
    const fd = openSync(dumpPath,'wx');
    try {
      execFileSync('docker', ['exec', ...['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'].flatMap((key) => ['-e',key]), '-e','PGSSLMODE=require',container,'pg_dump','--format=custom','--role=postgres','--schema=public','--schema=auth','--schema=storage','--schema=supabase_migrations'], { env:{...process.env,...connection,PGCONNECT_TIMEOUT:'30'}, stdio:['ignore',fd,'pipe'], timeout:600000 });
    } finally { closeSync(fd); }
    const bytes = readFileSync(dumpPath);
    const toc = execFileSync('docker',['exec','-i',container,'pg_restore','--list'],{input:bytes,encoding:'utf8',maxBuffer:10*1024*1024});
    save('backup-manifest.json',{project,file:'production-before-pooler.dump',sha256:hash(bytes),bytes:bytes.length,tables:toc.split('\n').filter((line)=>/ TABLE DATA /.test(line)).length,createdAt:new Date().toISOString(),mediaBytesIncluded:false});
    console.log(JSON.stringify({backup:'PASS',project,bytes:bytes.length,sha256:hash(bytes),productionWrites:0}));
  } else if (action === 'rehearse') {
    const bytes = readFileSync(path('production-before-pooler.dump'));
    if (hash(bytes) !== json('backup-manifest.json').sha256) throw new Error('Backup digest mismatch');
    if (process.argv[3] !== 'continue-owned-restore') {
      local(`CREATE DATABASE ${rehearsal} TEMPLATE template0;`,'postgres');
      local('DROP SCHEMA public; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;');
      const restore = spawnSync('docker',['exec','-i',container,'pg_restore','--exit-on-error','--no-owner','--no-acl','--username=postgres',`--dbname=${rehearsal}`],{input:bytes,encoding:'utf8',maxBuffer:30*1024*1024,timeout:120000});
      if (restore.error || restore.status !== 0) { writeFileSync(path('restore-error.private.log'),restore.stderr ?? 'Restore failed'); throw new Error('Local restore failed; see private diagnostics'); }
    }
    ledgerCheck(JSON.parse(local('SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations;')),false);
    const before = JSON.parse(local(`SELECT ${stateExpr};`));
    if (summaryDifferences(before,json('before.json').business).length) throw new Error('Restored business state differs from recorded production snapshot');
    local(`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; ${upgradesSql()} COMMIT;`);
    const after = JSON.parse(local(`SELECT ${stateExpr};`));
    if (summaryDifferences(before,after).length) throw new Error('Rehearsal changed historical business records');
    const ledger = JSON.parse(local('SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations;'));
    ledgerCheck(ledger,true);
    const output = {restore:'PASS',migrations:'PASS',migrationCount:ledger.length,businessDataUnchanged:true,database:rehearsal,sources:sources()};
    save('rehearsal.json',output); console.log(JSON.stringify(output));
  } else if (action === 'apply') {
    if (process.argv[3] !== 'approved-production-finance-fulfillment') throw new Error('Explicit release confirmation required');
    const rehearsalState = json('rehearsal.json');
    if (rehearsalState.migrations !== 'PASS' || JSON.stringify(rehearsalState.sources) !== JSON.stringify(sources())) throw new Error('Rehearsal no longer matches release');
    const live = remote(snapshotSql)[0]; ledgerCheck(live.migrations,false);
    const changed = summaryDifferences(live.business,json('before.json').business);
    if (changed.length) throw new Error('Production business records changed since backup; review and refresh backup before applying');
    const output = remote(`BEGIN; SET LOCAL ROLE postgres; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'; ${upgradesSql()}
     SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migrations,
      (SELECT count(*) FROM public.fulfillment_jobs) AS historical_jobs,
      (SELECT count(*) FROM public.order_message_outbox) AS historical_messages,
      (SELECT count(*) FROM public.inventory_cost_prices) AS invented_costs; COMMIT;`)[0];
    if (output.migrations !== 62 || output.historical_jobs !== 0 || output.historical_messages !== 0 || output.invented_costs !== 0) throw new Error('Release outcome requires immediate review; do not repeat migration');
    save('applied.json',{...output,appliedAt:new Date().toISOString(),sources:sources()}); console.log(JSON.stringify(output));
  } else if (action === 'access') {
    const result = remote(`BEGIN READ ONLY;
     DO $$ DECLARE actor uuid; report jsonb; BEGIN
      SELECT u.user_id INTO actor FROM public.user_roles u JOIN public.profiles p ON p.id=u.user_id WHERE u.role IN ('SUPER_ADMIN','ADMIN','FINANCE') AND p.account_status='ACTIVE' ORDER BY u.user_id LIMIT 1;
      IF actor IS NULL THEN RAISE EXCEPTION 'No active finance operator'; END IF;
      PERFORM set_config('request.jwt.claim.sub',actor::text,true);
      report:=public.finance_workspace('2026-10-01','2026-10-19');
      IF jsonb_typeof(report->'orders')<>'array' OR jsonb_typeof(report->'costs')<>'array' OR jsonb_typeof(report->'balances')<>'array' THEN RAISE EXCEPTION 'Finance report shape invalid'; END IF;
     END $$;
     SELECT NOT has_table_privilege('anon','public.inventory_cost_prices','SELECT') AS anonymous_costs_denied,
      NOT has_table_privilege('anon','public.order_item_cost_snapshots','SELECT') AS anonymous_sale_costs_denied,
      NOT has_function_privilege('authenticated','public.finance_workspace_base(date,date)','EXECUTE') AS internal_report_denied,
      NOT has_function_privilege('authenticated','public.claim_fulfillment_booking(uuid)','EXECUTE') AS direct_booking_claim_denied,
      NOT has_function_privilege('authenticated','public.advance_order_fulfillment_legacy(uuid,text,text)','EXECUTE') AS legacy_dispatch_bypass_denied,
      true AS authorised_report_shape_valid; COMMIT;`)[0];
    if (Object.values(result).some((value)=>value!==true)) throw new Error('Production access check failed');
    save('access-verified.json',result); console.log(JSON.stringify(result));
  } else if (action === 'cleanup-rehearsal') {
    const record = json('rehearsal.json');
    if (record.database !== rehearsal || record.restore !== 'PASS' || json('verified.json').schemaDifferences.length) throw new Error('Verified owned rehearsal required');
    if (hash(readFileSync(path('production-before-pooler.dump'))) !== json('backup-manifest.json').sha256) throw new Error('Recoverable backup required');
    const connections = Number(local(`SELECT count(*) FROM pg_stat_activity WHERE datname='${rehearsal}';`,'postgres').trim());
    if (connections) throw new Error('Rehearsal still in use; do not force disconnect');
    local(`DROP DATABASE ${rehearsal};`,'postgres');
    const result = {temporaryRestoredDatabaseRemoved:rehearsal,backupRetained:true,productionTouched:false};
    save('cleanup.json',result); console.log(JSON.stringify(result));
  } else if (action === 'verify') {
    const after = remote(snapshotSql)[0]; ledgerCheck(after.migrations,true);
    save('after.json',after);
    const clean = JSON.parse(local(metadataQuery,'postgres'));
    const schemaDifferences = summaryDifferences(after.metadata,clean);
    const businessDifferences = summaryDifferences(after.business,json('before.json').business);
    const result = {project,migrationCount:after.migrations.length,schemaDifferences,businessDifferences,verifiedAt:new Date().toISOString()};
    save('verified.json',result); console.log(JSON.stringify(result));
    if (schemaDifferences.length || businessDifferences.length) throw new Error('Production verification differs; review metadata before deployment');
  } else throw new Error('Use inspect, backup, rehearse, apply or verify');
} catch (error) {
  writeFileSync(path(`${action}-error.private.log`),error.stderr ?? error.stack ?? String(error));
  console.error(`Release ${action} did not complete. Private diagnostics saved; no automatic retry.`);
  process.exitCode=1;
}
