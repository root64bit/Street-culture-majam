// Prepare and verify only this gateway change against the last live source.
// Live payment activation requires a separately verified shared credential.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync, symlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const root = process.cwd(), folder = resolve('outputs/mpesa-yaka-release/20261102');
const baseline = 'dpl_HBZ45WL4N4yE8MvDj5vPchj9KJka';
const previous = JSON.parse(readFileSync('outputs/stripe-disconnect-release/20261030/source.json', 'utf8'));
const stage = join(tmpdir(), 'street-culture-yaka-mpesa-20261102');
const appFiles = ['src/lib/payments/yaka.ts', 'src/lib/payments/minescope.ts', 'src/lib/payments/gateways.ts', 'src/lib/payments/types.ts', 'src/app/api/payments/mpesa/initiate/route.ts', 'src/app/api/payments/mpesa/status/route.ts', 'src/components/commerce/CommerceOverlays.tsx', 'src/app/api/cron/payments/route.ts', 'tsconfig.json'];
const tests = ['tests/unit/payments/yaka.test.ts', 'tests/unit/payments/mpesa-initiate.test.ts', 'tests/unit/payments/mpesa-status.test.ts', 'tests/unit/payments/mpesa-installments.test.ts', 'tests/unit/payments/minescope-status.test.ts', 'tests/unit/payments/mpesa-phone.test.ts', 'tests/unit/payments/provider-policy.test.ts', 'tests/unit/components/CheckoutSheet.test.tsx', 'tests/unit/components/CheckoutProviderPolicy.test.tsx'];
const files = [...appFiles, ...tests, '.env.example', 'docs/mpesa-installments.md'];
const hash = value => createHash('sha256').update(value).digest('hex');
const hashes = dir => Object.fromEntries(files.map(file => [file, hash(readFileSync(join(dir, file)))]));
const save = (name, value) => writeFileSync(join(folder, name), JSON.stringify(value, null, 2));
const source = () => JSON.parse(readFileSync(join(folder, 'source.json'), 'utf8'));
function assertSource() {
  const expected = source().hashes;
  for (const directory of [root, stage]) {
    const current = hashes(directory);
    if (Object.keys(current).length !== Object.keys(expected).length ||
        Object.entries(expected).some(([file, value]) => current[file] !== value)) {
      throw new Error('Scoped source changed.');
    }
  }
}
function check(name, args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: stage, env, encoding: 'utf8', maxBuffer: 30_000_000, timeout: 600000 });
  writeFileSync(join(folder, name + '.log'), (result.stdout || '') + '\n' + (result.stderr || ''));
  if (result.status !== 0) throw new Error(name + ' failed; inspect its local log.');
}
mkdirSync(folder, { recursive: true });
try {
  const action = process.argv[2];
  if (action === 'prepare') {
    if (existsSync(stage)) throw new Error('Stage already exists; inspect before replacing.');
    const deployed = JSON.parse(readFileSync('outputs/stripe-disconnect-release/20261030/deployment.json', 'utf8'));
    if (deployed.id !== baseline) throw new Error('Unexpected source baseline.');
    for (const [file, expected] of Object.entries(previous.hashes)) {
      if (hash(readFileSync(join(previous.stage, file))) !== expected) throw new Error('Live source snapshot changed: ' + file);
    }
    const excluded = new Set(['node_modules', '.next', '.git', '.vercel', 'outputs']);
    function copy(from, to) {
      mkdirSync(to, { recursive: true });
      for (const entry of readdirSync(from, { withFileTypes: true })) {
        if (excluded.has(entry.name) || entry.name.startsWith('.env') || entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) copy(join(from, entry.name), join(to, entry.name));
        else copyFileSync(join(from, entry.name), join(to, entry.name));
      }
    }
    copy(previous.stage, stage);
    for (const file of files) {
      mkdirSync(dirname(join(stage, file)), { recursive: true });
      copyFileSync(join(root, file), join(stage, file));
    }
    const linkage = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
    if (linkage.projectId !== 'prj_MChaGWXQVO2QfNqjb1hQqtgIsD6H' || linkage.orgId !== 'team_3w4tp8YHefNPOisDsXAXD1M7') throw new Error('Wrong Vercel project.');
    mkdirSync(join(stage, '.vercel'));
    writeFileSync(join(stage, '.vercel/project.json'), JSON.stringify(linkage));
    symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'), 'junction');
    if (existsSync(join(stage, 'src/lib/receipts')) || existsSync(join(stage, 'src/lib/payments/stripe.ts'))) throw new Error('Unrelated drafts included.');
    save('source.json', { baseline, stage, appFiles, files, hashes: hashes(root), databaseChanges: false });
    console.log(JSON.stringify({ stage, applicationFiles: appFiles.length, databaseChanges: false }));
  } else if (action === 'check') {
    assertSource();
    save('checks.json', { tests: 'RUNNING', typescript: 'PENDING', lint: 'PENDING' });
    check('scoped-tests', [resolve('node_modules/vitest/vitest.mjs'), 'run', ...tests]);
    check('scoped-typescript', [resolve('node_modules/typescript/bin/tsc'), '--noEmit']);
    check('scoped-lint', [resolve('node_modules/eslint/bin/eslint.js'), ...appFiles.filter(x => /\.tsx?$/.test(x)), ...tests]);
    save('checks.json', { tests: 'PASS', typescript: 'PASS', lint: 'PASS' });
    console.log('Scoped tests, TypeScript and lint PASS.');
  } else if (action === 'build') {
    assertSource();
    const checks = JSON.parse(readFileSync(join(folder, 'checks.json'), 'utf8'));
    if (checks.tests !== 'PASS') throw new Error('Checks required.');
    const local = JSON.parse(execFileSync('supabase', ['status', '--workdir', resolve('outputs/sprint-1/environment'), '-o', 'json'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 20000 }));
    if (local.API_URL !== 'http://127.0.0.1:58321') throw new Error('Wrong isolated database.');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|CI|NUMBER_OF_PROCESSORS)$/i.test(key)));
    Object.assign(env, { NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3031', SC_EXTERNAL_SERVICES: 'disabled', MPESA_PAYMENTS_ENABLED: 'false', NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED: 'false', SQUARE_PAYMENTS_ENABLED: 'false', NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED: 'false', PAYFAST_SANDBOX_ENABLED: 'false', ORDER_EMAILS_ENABLED: 'false', FULFILLMENT_API_BOOKING_ENABLED: 'false' });
    check('build', [resolve('node_modules/next/dist/bin/next'), 'build'], env);
    assertSource();
    save('build.json', { passed: true, isolatedServices: true, realPaymentSubmitted: false });
    console.log('Scoped production build PASS with isolated services.');
  } else throw new Error('Choose prepare, check or build. Release requires authenticated readiness first.');
} catch (error) { console.error(error.message.split('\n')[0]); process.exitCode = 1; }
