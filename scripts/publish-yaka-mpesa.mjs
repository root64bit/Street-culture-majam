// Publish the verified source with payment initiation OFF until the shared
// gateway credential is provisioned. Does not submit a payment or change schema.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd(), folder = resolve('outputs/mpesa-yaka-release/20261102');
const project = 'prj_MChaGWXQVO2QfNqjb1hQqtgIsD6H', team = 'mm-global-techno-solutions-projects';
const cli = 'C:/Users/YUNI/AppData/Local/npm-cache/_npx/69f9afb961c37556/node_modules/vercel/dist/index.js';
const node = 'C:/Users/YUNI/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe';
const json = name => JSON.parse(readFileSync(join(folder, name), 'utf8'));
const save = (name, value) => writeFileSync(join(folder, name), JSON.stringify(value, null, 2));
const source = json('source.json'), github = json('github-release.json');
const command = (args, options = {}) => execFileSync(node, [cli, ...args, '--scope', team], {
  cwd: github.worktree, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 45000,
  maxBuffer: 20_000_000, ...options,
});
const api = path => JSON.parse(command(['api', path, '--raw']));
const production = () => api('/v9/projects/' + project).targets?.production;
const sha = value => createHash('sha256').update(value).digest('hex');
function assertSource() {
  for (const dir of [root, source.stage, github.worktree]) {
    for (const [file, hash] of Object.entries(source.hashes)) {
      if (sha(readFileSync(join(dir, file))) !== hash) throw new Error('Verified source changed: ' + file);
    }
  }
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: github.worktree, encoding: 'utf8' }).trim() !== github.commit) throw new Error('Git commit changed.');
}
function run(name, args) {
  const result = spawnSync(node, [cli, ...args, '--scope', team], { cwd: github.worktree,
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 600000, maxBuffer: 30_000_000 });
  writeFileSync(join(folder, name + '.log'), (result.stdout || '') + '\n' + (result.stderr || ''));
  if (result.status !== 0) throw new Error(name + ' failed; inspect the local log before retrying.');
  return result.stdout || '';
}

try {
  const action = process.argv[2];
  assertSource();
  if (action === 'deploy') {
    if (json('checks.json').tests !== 'PASS' || !json('build.json').passed ||
        statSync(join(folder, 'build.json')).mtimeMs < statSync(join(folder, 'source.json')).mtimeMs ||
        production()?.id !== source.baseline) throw new Error('Fresh verified build and unchanged production required.');
    const flags = { MPESA_PAYMENTS_ENABLED: 'false', NEXT_PUBLIC_MPESA_PAYMENTS_ENABLED: 'false',
      SQUARE_PAYMENTS_ENABLED: 'false', NEXT_PUBLIC_SQUARE_PAYMENTS_ENABLED: 'false', PAYFAST_SANDBOX_ENABLED: 'false',
      ORDER_EMAILS_ENABLED: 'true', FULFILLMENT_API_BOOKING_ENABLED: 'false' };
    const output = run('deployment.private', ['deploy', '--prod', '--skip-domain', '--yes', '--archive=tgz',
      ...Object.entries(flags).flatMap(([key, value]) => ['--env', key + '=' + value, '--build-env', key + '=' + value])]);
    const url = output.match(/https:\/\/street-culture-majam-[a-z0-9]+\.vercel\.app/)?.[0];
    if (!url) throw new Error('Deployment result unknown; inspect before retrying.');
    const deployed = api('/v13/deployments/' + new URL(url).hostname);
    if (deployed.readyState !== 'READY') throw new Error('Deployment is not ready.');
    save('staged-deployment.json', { id: deployed.id, url, flags, readyState: deployed.readyState, commit: github.commit });
    console.log(JSON.stringify(json('staged-deployment.json')));
  } else if (action === 'verify-staged' || action === 'verify-production') {
    const staged = action === 'verify-staged', deployment = json('staged-deployment.json');
    const origin = staged ? deployment.url : 'https://www.streetculturevault.com';
    const checks = [];
    const cases = [['/', 'GET', staged ? 308 : 200],
      ['/api/payments/mpesa/initiate', 'POST', 503], ['/api/payments/mpesa/status', 'POST', 400],
      ['/api/payments/square', 'POST', 503], ['/api/payments/square/quote', 'POST', 503],
      ['/api/payments/payfast-sandbox/notify', 'POST', 503],
      ['/api/payments/stripe/quote', 'POST', 404], ['/api/payments/stripe/session', 'POST', 404],
      ['/api/payments/stripe/webhook', 'POST', 404],
      ['/api/checkout/orders', 'POST', 503], ['/api/cron/payments', 'GET', 401]];
    for (const [path, method, expected] of cases) {
      let status, body;
      if (staged) {
        const args = [cli, 'curl', path, '--deployment', origin, '--scope', team, '--',
          '--silent', '--show-error', '--include', '--max-time', '35', '--write-out', '\nSC_STATUS:%{http_code}'];
        if (method === 'POST') args.push('--request', 'POST', '--header', 'Content-Type: application/json', '--data', '{}');
        const output = execFileSync(node, args, { cwd: github.worktree, encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'], timeout: 50000, maxBuffer: 15_000_000 });
        const match = output.match(/\nSC_STATUS:(\d{3})\s*$/);
        if (!match) throw new Error('Missing HTTP result: ' + path);
        status = Number(match[1]); body = output.slice(0, match.index);
      } else {
        const response = await fetch(origin + path, { method, redirect: 'manual',
          ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
          signal: AbortSignal.timeout(35000) });
        status = response.status; body = await response.text();
      }
      if (status !== expected) throw new Error(path + ': unexpected HTTP ' + status);
      if (path === '/api/payments/mpesa/initiate' && !body.includes('not enabled')) throw new Error('Payment-off guard not verified.');
      if (path === '/api/checkout/orders' && !body.includes('Checkout is not enabled')) throw new Error('Checkout-off guard not verified.');
      checks.push({ path, method, status });
    }
    save(staged ? 'staged-verified.json' : 'verified.json', { passed: true, origin, checks,
      checkedAt: new Date().toISOString(), noRealPaymentSubmitted: true, noCustomerMessagesSent: true });
    console.log(JSON.stringify({ passed: true, origin, checks: checks.length }));
  } else if (action === 'promote') {
    if (production()?.id !== source.baseline || !json('staged-verified.json').passed) throw new Error('Verified staged build and unchanged production required.');
    run('promotion.private', ['promote', json('staged-deployment.json').url, '--yes']);
    const live = production();
    if (live?.id !== json('staged-deployment.json').id || live.readyState !== 'READY') throw new Error('Unexpected live deployment.');
    save('deployment.json', { id: live.id, url: 'https://' + live.url, readyState: live.readyState,
      canonical: 'https://www.streetculturevault.com', commit: github.commit, paymentInitiationEnabled: false, databaseChanges: false });
    console.log(JSON.stringify(json('deployment.json')));
  } else throw new Error('Choose deploy, verify-staged, promote or verify-production.');
} catch (error) { console.error(error.message.split('\n')[0]); process.exitCode = 1; }
