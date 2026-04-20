'use strict';

const fs   = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'post-history.json');
const MAX_RECORDS = 90;

function loadHistory() {
  if (!fs.existsSync(STATE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function savePostRecord(record) {
  const history = loadHistory();
  history.unshift({ ...record, published_at: new Date().toISOString() });
  const trimmed = history.slice(0, MAX_RECORDS);
  fs.writeFileSync(STATE_FILE, JSON.stringify(trimmed, null, 2));
  return trimmed[0];
}

function getRecentPosts(limit = 10) {
  return loadHistory().slice(0, limit);
}

module.exports = { loadHistory, savePostRecord, getRecentPosts };
