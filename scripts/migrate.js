#!/usr/bin/env node
/**
 * Run pending Supabase migrations via the Management API.
 * Usage:
 *   node scripts/migrate.js           # runs all unapplied migrations
 *   node scripts/migrate.js 014       # runs only migration 014
 *   node scripts/migrate.js --list    # shows which migrations have been applied
 *
 * Requires SUPABASE_ACCESS_TOKEN in .env (Dashboard → Account → Access Tokens).
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

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF  = 'uvxuwlskpofdypwvdoxx';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const APPLIED_FILE   = path.join(__dirname, '..', '.supabase_applied');

if (!ACCESS_TOKEN) {
  console.error('\nError: SUPABASE_ACCESS_TOKEN not set in .env');
  console.error('Get one at: https://supabase.com/dashboard/account/tokens\n');
  process.exit(1);
}

// ─── Track applied migrations locally ────────────────────────────────────────
function getApplied() {
  try { return new Set(JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf8'))); }
  catch { return new Set(); }
}
function markApplied(name) {
  const applied = getApplied();
  applied.add(name);
  fs.writeFileSync(APPLIED_FILE, JSON.stringify([...applied].sort(), null, 2));
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

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // Get all migration files sorted
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

  // Filter to just the requested migration(s)
  const filter = args[0]; // e.g. "014" or undefined
  const toRun = filter
    ? all.filter((f) => f.startsWith(filter))
    : all.filter((f) => !getApplied().has(f));

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
