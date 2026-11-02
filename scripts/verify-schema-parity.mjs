import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const directory = resolve('outputs/sprint-1/schema');
mkdirSync(directory, { recursive: true });
const query = `SELECT json_build_object(
 'columns',(SELECT json_agg(x ORDER BY table_name,ordinal_position) FROM (SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public') x),
 'constraints',(SELECT json_agg(x ORDER BY relation,name) FROM (SELECT conrelid::regclass::text relation,conname name,pg_get_constraintdef(oid) definition,convalidated validated FROM pg_constraint WHERE connamespace='public'::regnamespace) x),
 'indexes',(SELECT json_agg(x ORDER BY tablename,indexname) FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public') x),
 'tables',(SELECT json_agg(x ORDER BY relname) FROM (SELECT relname,relkind,relrowsecurity,reloptions FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v')) x),
 'policies',(SELECT json_agg(x ORDER BY tablename,policyname) FROM (SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public') x),
 'functions',(SELECT json_agg(x ORDER BY signature) FROM (SELECT oid::regprocedure::text signature,regexp_replace(pg_get_functiondef(oid),'[[:space:]]+',' ','g') definition,proacl::text grants FROM pg_proc WHERE pronamespace='public'::regnamespace) x),
 'triggers',(SELECT json_agg(x ORDER BY relation,tgname) FROM (SELECT tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)) x),
 'grants',(SELECT json_agg(x ORDER BY table_name,grantee,privilege_type) FROM (SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public') x)
);`;
const containers = ['supabase_db_street_culture', 'supabase_db_street_culture_sprint1_test'];
const snapshots = containers.map((container) => {
  const json = execFileSync(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', query],
    { encoding: 'utf8' }
  );
  const value = JSON.parse(json);
  writeFileSync(resolve(directory, `${container}.json`), JSON.stringify(value, null, 2));
  return value;
});
const differences = Object.keys(snapshots[0]).flatMap((section) => {
  const a = snapshots[0][section] ?? [],
    b = snapshots[1][section] ?? [];
  return JSON.stringify(a) === JSON.stringify(b)
    ? []
    : [{ section, currentCount: a.length, cleanCount: b.length }];
});
const comm = (value) =>
  Object.fromEntries(
    Object.entries(value).map(([key, rows]) => [
      key,
      (rows ?? []).filter((row) =>
        /auth_email_deliveries|newsletter_|claim_newsletter_batch/.test(JSON.stringify(row))
      ),
    ])
  );
const communicationsMatch =
  JSON.stringify(comm(snapshots[0])) === JSON.stringify(comm(snapshots[1]));
const result = {
  communicationsMatch,
  differences,
  note: 'Metadata only. No row/customer data exported. Full definitions in ignored local snapshots.',
};
writeFileSync(resolve(directory, 'comparison.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
