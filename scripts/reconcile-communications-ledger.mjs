// Only records the already-verified communications version on the shared LOCAL
// project. Never reapplies its DDL, links a cloud project or rewrites business data.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backup = resolve(root, 'outputs/sprint-1/backups/local-pre-sprint-1.dump');
const comparison = JSON.parse(
  readFileSync(resolve(root, 'outputs/sprint-1/schema/comparison.json'), 'utf8')
);
if (
  !comparison.communicationsMatch ||
  !existsSync(backup) ||
  readFileSync(backup).subarray(0, 5).toString() !== 'PGDMP'
)
  throw new Error('A verified schema comparison and custom-format local backup are required.');
if (
  !readFileSync(resolve(root, 'supabase/config.toml'), 'utf8').includes(
    'project_id = "street_culture"'
  )
)
  throw new Error('Unexpected local project.');
const mapping = execFileSync('docker', ['port', 'supabase_db_street_culture', '5432'], {
  encoding: 'utf8',
});
if (!mapping.includes(':54322')) throw new Error('Unexpected local database port.');
if (process.argv[2] !== '--apply-local-ledger') {
  console.log(
    'Verification passed. No changes made; use --apply-local-ledger only after reviewing backup and comparison.'
  );
} else {
  execFileSync(
    process.env.SC_SUPABASE_CLI || 'supabase',
    ['migration', 'repair', '--local', '--workdir', root, '--status', 'applied', '20261017160000'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  console.log(
    'Recorded only local migration version 20261017160000 as applied. No communications DDL or business rows changed.'
  );
}
