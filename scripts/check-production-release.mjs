// Read-only release evidence. Never applies migrations or invokes payment RPCs.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const project = 'tysibniisuobzpmnhwkf';
if (readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== project) {
  throw new Error('Unexpected linked production project');
}
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Specify before or after');
const directory = resolve('outputs/sprint-1/release');
mkdirSync(directory, { recursive: true });
const source = readFileSync('scripts/verify-schema-parity.mjs', 'utf8');
const metadataQuery = source.match(/const query = `([\s\S]*?)`;/)?.[1];
if (!metadataQuery?.startsWith('SELECT json_build_object(')) {
  throw new Error('Expected read-only metadata query');
}
const sql = `BEGIN READ ONLY;
SELECT (${metadataQuery.trim().replace(/;$/, '')}) AS metadata,
 (SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations) AS migrations,
 json_build_object(
 'products',(SELECT count(*) FROM public.products),
 'orders',(SELECT count(*) FROM public.orders),
 'payments',(SELECT count(*) FROM public.payments),
 'reserved_listings',(SELECT count(*) FROM public.listings WHERE status='RESERVED'),
 'product_hash',(SELECT md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY id),'')) FROM public.products p),
 'listing_hash',(SELECT md5(coalesce(string_agg(md5(to_jsonb(l)::text),'' ORDER BY id),'')) FROM public.listings l)
 ) AS business_state;
COMMIT;`;
const raw = execFileSync('supabase', ['db', 'query', '--linked', '--output', 'json', sql], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
const result = JSON.parse(raw);
const snapshot = result.rows?.[0];
if (!snapshot?.metadata || !Array.isArray(snapshot.migrations)) {
  throw new Error('Invalid production metadata response');
}
writeFileSync(resolve(directory, `production-${phase}.json`), JSON.stringify(snapshot, null, 2));
const expected =
  phase === 'before'
    ? JSON.parse(readFileSync('outputs/sprint-1/schema/supabase_db_street_culture.json', 'utf8'))
    : JSON.parse(
        execFileSync(
          'docker',
          [
            'exec',
            'supabase_db_street_culture_sprint1_test',
            'psql',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-At',
            '-c',
            metadataQuery,
          ],
          { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
        )
      );
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
const changes = Object.keys(snapshot.metadata).flatMap((section) => {
  const remote = snapshot.metadata[section] ?? [];
  const local = expected[section] ?? [];
  if (canonical(remote) === canonical(local)) return [];
  const key = (row) =>
    section === 'columns'
      ? `${row.table_name}.${row.column_name}`
      : section === 'constraints'
        ? `${row.relation}.${row.name}`
        : section === 'indexes'
          ? `${row.tablename}.${row.indexname}`
          : section === 'tables'
            ? row.relname
            : section === 'policies'
              ? `${row.tablename}.${row.policyname}`
              : section === 'functions'
                ? row.signature
                : section === 'triggers'
                  ? `${row.relation}.${row.tgname}`
                  : `${row.table_name}.${row.grantee}.${row.privilege_type}`;
  const left = new Map(remote.map((row) => [key(row), row]));
  const right = new Map(local.map((row) => [key(row), row]));
  return [
    {
      section,
      remoteCount: remote.length,
      expectedCount: local.length,
      remoteOnly: [...left.keys()].filter((id) => !right.has(id)),
      expectedOnly: [...right.keys()].filter((id) => !left.has(id)),
      different: [...left.keys()].filter(
        (id) => right.has(id) && canonical(left.get(id)) !== canonical(right.get(id))
      ),
    },
  ];
});
const summary = {
  project,
  phase,
  migrations: snapshot.migrations.length,
  business: snapshot.business_state,
  schemaDifferences: changes,
};
writeFileSync(
  resolve(directory, `production-${phase}-summary.json`),
  JSON.stringify(summary, null, 2)
);
console.log(JSON.stringify(summary, null, 2));
