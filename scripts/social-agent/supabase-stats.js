'use strict';

const { createClient } = require('@supabase/supabase-js');

function getClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY)');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getAppStats() {
  const sb = getClient();

  const { data: leaderboard, error: lErr } = await sb.rpc('fetch_leaderboard', { p_limit: 10 });
  if (lErr) throw new Error(`Leaderboard fetch failed: ${lErr.message}`);

  const { count: totalReports, error: tErr } = await sb
    .from('reports')
    .select('*', { count: 'exact', head: true });
  if (tErr) throw new Error(`Total reports fetch failed: ${tErr.message}`);

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count: weeklyReports, error: wErr } = await sb
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', weekAgo);
  if (wErr) throw new Error(`Weekly reports fetch failed: ${wErr.message}`);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayReports, error: dErr } = await sb
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());
  if (dErr) throw new Error(`Today reports fetch failed: ${dErr.message}`);

  return {
    leaderboard: (leaderboard ?? []).map((u, i) => ({
      rank: i + 1,
      username: u.username || 'Anonymous',
      points: u.points ?? 0,
      reports_count: u.reports_count ?? 0,
    })),
    total_reports: totalReports ?? 0,
    weekly_reports: weeklyReports ?? 0,
    today_reports: todayReports ?? 0,
  };
}

module.exports = { getAppStats };
