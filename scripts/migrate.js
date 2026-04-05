#!/usr/bin/env node
/**
 * Run pending Supabase migrations via psql.
 * Tracks applied migrations in a _migrations table in the DB itself.
 *
 * Usage:
 *   node scripts/migrate.js           # runs all unapplied migrations
 *   node scripts/migrate.js 014       # runs only migration(s) matching "014"
 *   node scripts/migrate.js --list    # shows applied/pending status
 *
 * Requires in .env (or environment):
 *   SUPABASE_DB_PASSWORD   — from Supabase Dashboard → Settings → Database
 *
 * Connection uses Supabase's direct connection (port 5432).
 */

const fs    = require('fs');
const path  = require('path');
const cp    = require('child_process');

// ─── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const DB_PASSWORD    = process.env.SUPABASE_DB_PASSWORD;
const PROJECT_REF    = 'uvxuwlskpofdypwvdoxx';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

if (!DB_PASSWORD) {
  console.error('\nError: SUPABASE_DB_PASSWORD not set in .env or environment');
  console.error('Get it from: Supabase Dashboard → Settings → Database\n');
  process.exit(1);
}

// ─── Run SQL via psql ─────────────────────────────────────────────────────────
const PSQL_ENV = {
  ...process.env,
  PGHOST:     `aws-0-us-east-1.pooler.supabase.com`,
  PGPORT:     '5432',
  PGUSER:     `postgres.${PROJECT_REF}`,
  PGPASSWORD: DB_PASSWORD,
  PGDATABASE: 'postgres',
};

function psql(sql) {
  const result = cp.spawnSync('psql', ['-c', sql], {
    encoding: 'utf8',
    env: PSQL_ENV,
  });
  if (result.error) throw new Error(`psql not found: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'psql error');
  return result.stdout;
}

function psqlFile(filePath) {
  const result = cp.spawnSync('psql', ['-f', filePath], {
    encoding: 'utf8',
    env: PSQL_ENV,
  });
  if (result.error) throw new Error(`psql not found: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'psql error');
  return result.stdout;
}

// ─── Bootstrap tracking table ─────────────────────────────────────────────────
function ensureTrackingTable() {
  psql(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function getApplied() {
  const out = psql(`SELECT name FROM _migrations ORDER BY name;`);
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  // psql output: header, separator, rows, count line
  return new Set(
    lines.filter((l) => !l.startsWith('name') && !l.startsWith('---') && !l.match(/^\(\d+ rows?\)$/))
  );
}

function markApplied(name) {
  psql(`INSERT INTO _migrations (name) VALUES ('${name}') ON CONFLICT DO NOTHING;`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  ensureTrackingTable();

  const all = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (args.includes('--list')) {
    const applied = getApplied();
    console.log('\nMigrations:');
    all.forEach((f) => console.log(`  ${applied.has(f) ? '✓' : '○'} ${f}`));
    console.log('');
    return;
  }

  const filter  = args[0];
  const applied = getApplied();
  const toRun   = filter
    ? all.filter((f) => f.startsWith(filter))
    : all.filter((f) => !applied.has(f));

  if (toRun.length === 0) {
    console.log('\nAll migrations already applied. Nothing to do.\n');
    return;
  }

  console.log(`\nRunning ${toRun.length} migration(s):\n`);

  for (const file of toRun) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    process.stdout.write(`  → ${file} ... `);
    try {
      psqlFile(filePath);
      markApplied(file);
      console.log('✓ done');
    } catch (e) {
      console.log(`✗ FAILED\n\n${e.message}\n`);
      process.exit(1);
    }
  }

  console.log('\nAll done.\n');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
