#!/usr/bin/env node
/**
 * Run pending Supabase migrations via the Management API.
 * Tracks applied migrations in a _migrations table in the DB itself,
 * so it works correctly in CI (GitHub Actions) and locally.
 *
 * Usage:
 *   node scripts/migrate.js           # runs all unapplied migrations
 *   node scripts/migrate.js 014       # runs only migration(s) matching "014"
 *   node scripts/migrate.js --list    # shows applied/pending status
 *
 * Requires SUPABASE_ACCESS_TOKEN in .env
 */

const fs   = require('fs');
const path = require('path');

// ─── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const ACCESS_TOKEN   = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF    = 'uvxuwlskpofdypwvdoxx';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

if (!ACCESS_TOKEN) {
  console.error('\nError: SUPABASE_ACCESS_TOKEN not set in .env');
  console.error('Get one at: https://supabase.com/dashboard/account/tokens\n');
  process.exit(1);
}

// ─── Execute SQL via Management API ──────────────────────────────────────────
async function runSQL(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.message ?? body?.error ?? JSON.stringify(body);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return body;
}

// ─── Bootstrap tracking table ─────────────────────────────────────────────────
async function ensureTrackingTable() {
  await runSQL(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getApplied() {
  const rows = await runSQL(`SELECT name FROM _migrations ORDER BY name;`);
  return new Set((rows ?? []).map((r) => r.name));
}

async function markApplied(name) {
  await runSQL(`INSERT INTO _migrations (name) VALUES ('${name}') ON CONFLICT DO NOTHING;`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  await ensureTrackingTable();

  const all = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (args.includes('--list')) {
    const applied = await getApplied();
    console.log('\nMigrations:');
    all.forEach((f) => console.log(`  ${applied.has(f) ? '✓' : '○'} ${f}`));
    console.log('');
    return;
  }

  const filter  = args[0];
  const applied = await getApplied();
  const toRun   = filter
    ? all.filter((f) => f.startsWith(filter))
    : all.filter((f) => !applied.has(f));

  if (toRun.length === 0) {
    console.log('\nAll migrations already applied. Nothing to do.\n');
    return;
  }

  console.log(`\nRunning ${toRun.length} migration(s):\n`);

  for (const file of toRun) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  → ${file} ... `);
    try {
      await runSQL(sql);
      await markApplied(file);
      console.log('✓ done');
    } catch (e) {
      console.log(`✗ FAILED\n\n${e.message}\n`);
      process.exit(1);
    }
  }

  console.log('\nAll done.\n');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
