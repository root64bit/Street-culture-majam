// Encrypted transport, read-only pg_dump; backup artifacts never enter deployment.
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const project = 'tysibniisuobzpmnhwkf';
if (readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== project) {
  throw new Error('Unexpected linked production project');
}
const raw = execFileSync('supabase', ['db', 'dump', '--linked', '--dry-run'], {
  encoding: 'utf8',
  maxBuffer: 5 * 1024 * 1024,
});
const connection = {};
for (const match of raw.matchAll(/^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)=(.+)$/gm)) {
  let value = match[2].trim();
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1);
  }
  if (/[\r\n`$\\'"\s]/.test(value)) throw new Error('Unsupported connection quoting');
  connection[match[1]] = value;
}
if (
  Object.keys(connection).length !== 5 ||
  connection.PGDATABASE !== 'postgres' ||
  !['5432', '6543'].includes(connection.PGPORT) ||
  (!connection.PGHOST.endsWith('.supabase.co') &&
    !connection.PGHOST.endsWith('.pooler.supabase.com')) ||
  !`${connection.PGHOST}/${connection.PGUSER}`.includes(project)
) {
  throw new Error('Unexpected backup database connection');
}
const container = 'supabase_db_street_culture_sprint1_test';
execFileSync('docker', ['inspect', '--format', '{{.Name}}', container], { stdio: 'ignore' });
const directory = resolve('outputs/sprint-1/backups');
mkdirSync(directory, { recursive: true });
const path = resolve(directory, 'production-pre-release-pg17-complete.dump');
if (existsSync(path)) throw new Error('Refusing to overwrite an existing backup');
const descriptor = openSync(path, 'wx');
try {
  execFileSync(
    'docker',
    [
      'exec',
      '-e',
      'PGHOST',
      '-e',
      'PGPORT',
      '-e',
      'PGUSER',
      '-e',
      'PGPASSWORD',
      '-e',
      'PGDATABASE',
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
      stdio: ['ignore', descriptor, 'pipe'],
      timeout: 600000,
    }
  );
} catch (error) {
  writeFileSync(
    resolve(directory, 'production-backup-error.private.log'),
    error.stderr ?? String(error.code)
  );
  throw new Error('Production backup failed; partial artifact must not be used');
} finally {
  closeSync(descriptor);
}
const toc = execFileSync('docker', ['exec', '-i', container, 'pg_restore', '--list'], {
  input: readFileSync(path),
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
const bytes = readFileSync(path);
const evidence = {
  project,
  path,
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  tocEntries: toc.split('\n').filter((line) => /^\d+;/.test(line)).length,
  tableDataEntries: toc.split('\n').filter((line) => / TABLE DATA /.test(line)).length,
  schemaScope: ['public', 'auth', 'storage', 'supabase_migrations'],
  note: 'Database backup only; media object bytes are unchanged and are not included.',
};
writeFileSync(
  resolve(directory, 'production-pre-release-pg17-complete-manifest.json'),
  JSON.stringify(evidence, null, 2)
);
console.log(JSON.stringify(evidence, null, 2));
