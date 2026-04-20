'use strict';

const { getRecentPosts } = require('./state');

const LA_TIMEZONE = 'America/Los_Angeles';

// Optimal posting windows (LA local time, 24h format)
const WINDOWS = {
  twitter: [
    { start: 7, end: 9 },
    { start: 12, end: 13 },
    { start: 17, end: 19 },
  ],
  instagram: [
    { start: 11, end: 13 },
    { start: 19, end: 21 },
  ],
  tiktok: [
    { start: 7, end: 9 },
    { start: 12, end: 14 },
    { start: 19, end: 21 },
  ],
};

function getLAHour() {
  const now = new Date();
  const laStr = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).format(now);
  return parseInt(laStr, 10);
}

function getLATimeString() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    weekday: 'short',
  }).format(new Date());
}

function isInWindow(hour, windows) {
  return windows.some((w) => hour >= w.start && hour < w.end);
}

function windowsDescription(windows) {
  return windows.map((w) => `${w.start}:00–${w.end}:00`).join(', ');
}

function minutesSinceLastPost(platform) {
  const recent = getRecentPosts(20);
  const last = recent.find((p) => p.platform === platform && !p.draft);
  if (!last) return Infinity;
  return (Date.now() - new Date(last.published_at).getTime()) / 60000;
}

function getBestPostingTime(platform) {
  const hour = getLAHour();
  const currentTimeLA = getLATimeString();
  const platforms = platform === 'all' ? ['twitter', 'instagram', 'tiktok'] : [platform];
  const results = {};

  for (const p of platforms) {
    const windows = WINDOWS[p] || WINDOWS.twitter;
    const inWindow = isInWindow(hour, windows);
    const minsSinceLast = minutesSinceLastPost(p);
    const tooRecent = minsSinceLast < 240; // 4 hour minimum gap

    let should_post = inWindow && !tooRecent;
    let reason = '';

    if (!inWindow) {
      reason = `Current LA time (${currentTimeLA}) is outside optimal windows: ${windowsDescription(windows)}`;
    } else if (tooRecent) {
      reason = `Last ${p} post was only ${Math.round(minsSinceLast)} minutes ago (minimum gap: 240 min)`;
    } else {
      reason = `Within optimal window for ${p}`;
    }

    results[p] = { should_post, reason, optimal_windows: windowsDescription(windows) };
  }

  return { current_time_la: currentTimeLA, la_hour: hour, platforms: results };
}

module.exports = { getBestPostingTime };
