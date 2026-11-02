// Mechanical code generation, only after canonical migrations pass on the
// explicitly named disposable database. Never generates from a cloud project.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const workspace = resolve('outputs/sprint-1/environment');
execFileSync(process.execPath, ['scripts/sprint1-test-environment.mjs', 'status'], {
  stdio: 'pipe',
});
const types = execFileSync(
  process.env.SC_SUPABASE_CLI || 'supabase',
  ['gen', 'types', 'typescript', '--local', '--workdir', workspace],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
);
if (
  !types.includes('checkout_shipping_quotes') ||
  !types.includes('create_quoted_checkout_order') ||
  !types.includes('claim_square_checkout_payment')
)
  throw new Error('Expected Sprint 1 schema not found; source types not changed.');
if (types.includes('sprint1_test_attestation'))
  throw new Error(
    'Generate types immediately after rebuilding the disposable schema, before installing test-only fixtures.'
  );
// Keep the CLI's generated style (this file is intentionally prettier-ignored),
// but remove its whitespace-only lines so git diff --check remains useful.
writeFileSync(resolve('src/types/database.types.ts'), types.replace(/[ \t]+$/gm, ''));
console.log('Regenerated database types from the verified disposable schema.');
