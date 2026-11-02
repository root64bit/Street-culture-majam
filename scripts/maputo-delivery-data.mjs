// Guarded shipping-only backup, restore rehearsal and explicit release actions.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
const project = 'tysibniisuobzpmnhwkf', container = 'supabase_db_street_culture_sprint1_test';
const folder = resolve('outputs/maputo-delivery-release/20261102');
const migration = '20261102153627_portador_diario_quotes.sql', version = migration.slice(0, 14);
const file = join('supabase/migrations', migration);
mkdirSync(folder, { recursive: true });
if (readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== project) throw new Error('Wrong production project.');
const save = (name, data) => writeFileSync(join(folder, name), JSON.stringify(data, null, 2));
const json = name => JSON.parse(readFileSync(join(folder, name), 'utf8'));
const remote = sql => JSON.parse(execFileSync('supabase', ['db', 'query', '--linked', '--output', 'json', sql], {
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 45000, maxBuffer: 60_000_000,
})).rows || [];
const local = sql => execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
  input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 45000, maxBuffer: 60_000_000,
}).trim();
function assertLocal() {
  if (local('select public.sprint1_test_attestation();') !== 'street_culture_sprint1_test') throw new Error('Wrong isolated test database.');
}
const values = [
  ['SC_MZ_MAPUTO_CITY', 'Local delivery — Maputo city', 100],
  ['SC_MZ_COSTA_DO_SOL', 'Local delivery — Costa do Sol', 200],
  ['SC_MZ_ALBASINE', 'Local delivery — Albasine', 500],
  ['SC_MZ_MATOLA', 'Local delivery — Matola', 500],
];
const codes = values.map(v => `'${v[0]}'`).join(',');
const seed = active => `INSERT INTO public.shipping_methods(code,name,country_code,region,price,currency,estimated_min_days,estimated_max_days,active) VALUES ${values.map(([code, name, price]) => `('${code}','${name}','MZ',NULL,${price},'MZN',0,0,${active})`).join(',')} ON CONFLICT(code) DO UPDATE SET name=excluded.name,country_code=excluded.country_code,region=NULL,price=excluded.price,currency='MZN',estimated_min_days=0,estimated_max_days=0,active=excluded.active;`;
try {
  const action = process.argv[2];
  if (action === 'backup') {
    const quotes = remote("SET TIME ZONE 'UTC'; SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]') AS data,count(*) AS count,md5(coalesce(string_agg(md5(to_jsonb(q)::text),'' ORDER BY q.id),'')) AS hash FROM public.checkout_shipping_quotes q;")[0];
    const methods = remote('select * from public.shipping_methods order by id;');
    const constraints = remote("select conname,pg_get_constraintdef(oid) AS definition from pg_constraint where conrelid='public.checkout_shipping_quotes'::regclass and conname in ('checkout_shipping_quotes_provider_check','checkout_shipping_quotes_check3') order by conname;");
    writeFileSync(join(folder, 'production-before.private.json'), JSON.stringify({ project, capturedAt: new Date().toISOString(), quotes, methods, constraints }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ backup: 'PASS', quoteRows: quotes.count, shippingMethods: methods.length }));
  } else if (action === 'restore-check') {
    assertLocal();
    const before = json('production-before.private.json');
    const schema = 'sc_delivery_restore_' + randomBytes(4).toString('hex');
    const columns = local("select string_agg(quote_ident(column_name),',' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='checkout_shipping_quotes' and is_generated='NEVER';");
    const marker = '$restore_' + randomBytes(6).toString('hex') + '$';
    const data = JSON.stringify(before.quotes.data);
    if (data.includes(marker)) throw new Error('Unsafe restore delimiter.');
    const result = local(`BEGIN; SET LOCAL TIME ZONE 'UTC'; CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.quotes (LIKE public.checkout_shipping_quotes INCLUDING ALL); INSERT INTO ${schema}.quotes(${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${schema}.quotes,${marker}${data}${marker}::jsonb); SELECT md5(coalesce(string_agg(md5(to_jsonb(q)::text),'' ORDER BY q.id),'')) FROM ${schema}.quotes q; ROLLBACK;`);
    if (result !== before.quotes.hash) throw new Error('Backup restore hash mismatch.');
    save('restore-check.json', { passed: true, quoteRows: before.quotes.count, exactHashMatched: true, rolledBack: true, database: 'street_culture_sprint1_test' });
    console.log('Shipping quote backup restored and hash-verified in an isolated rollback transaction.');
  } else if (action === 'migrate-local') {
    assertLocal();
    local('BEGIN; ' + readFileSync(file, 'utf8') + ' COMMIT;');
    local(seed(true));
    save('local-migration.json', { passed: true, migration, seededLocalRates: true });
    console.log('Local quote-provider validation extended and four local delivery methods seeded.');
  } else if (action === 'migrate-production') {
    if (!json('restore-check.json').passed || !json('local-migration.json').passed || !json('checks.json').passed) throw new Error('Restore rehearsal and release checks required.');
    if (remote(`select version from supabase_migrations.schema_migrations where version='${version}';`).length) throw new Error('Migration already exists; inspect before retrying.');
    const sql = `BEGIN; ${readFileSync(file, 'utf8')} INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('${version}','portador_diario_quotes'); COMMIT;`;
    remote(sql);
    const validated = remote("select conname,convalidated from pg_constraint where conrelid='public.checkout_shipping_quotes'::regclass and conname in ('checkout_shipping_quotes_provider_check','checkout_shipping_quotes_check3');");
    if (validated.length !== 2 || validated.some(c => !c.convalidated)) throw new Error('Constraint validation not confirmed.');
    save('production-migration.json', { passed: true, version, sourceHash: createHash('sha256').update(readFileSync(file)).digest('hex'), constraintsValidated: true });
    console.log('Production quote-provider extension applied; existing quote/order amounts were not changed.');
  } else if (action === 'seed-inactive') {
    if (!json('production-migration.json').passed) throw new Error('Migration required.');
    if (remote(`select code from public.shipping_methods where code in (${codes});`).length) throw new Error('Local method codes already exist; inspect before changing them.');
    remote('BEGIN; ' + seed(false) + ' COMMIT;');
    save('seeded.json', { passed: true, active: false, codes: values.map(v => v[0]) });
    console.log('Four delivery rates saved inactive until the new destination filter is live.');
  } else if (action === 'activate') {
    if (!json('deployment.json').id || !json('seeded.json').passed) throw new Error('New production deployment and inactive methods required.');
    const result = remote(`UPDATE public.shipping_methods SET active=true WHERE code IN (${codes}) RETURNING code,name,price,currency,active;`);
    if (result.length !== 4 || result.some(r => r.currency !== 'MZN' || Number(r.price) !== values.find(v => v[0] === r.code)?.[2])) throw new Error('Delivery rates were not confirmed.');
    save('active-rates.json', { passed: true, rates: result });
    console.log(JSON.stringify({ activeDeliveryRates: result.map(r => ({ code: r.code, price: r.price, currency: r.currency })) }));
  } else throw new Error('Choose backup, restore-check, migrate-local, migrate-production, seed-inactive or activate.');
} catch (error) { console.error('Shipping data action stopped: ' + (error.message.startsWith('Command failed') ? 'inspect the private operation; no automatic retry.' : error.message)); process.exitCode = 1; }
