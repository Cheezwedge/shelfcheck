'use strict';

const crypto = require('crypto');

const API_BASE = 'https://api.twitter.com/2';

function percentEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function buildAuthHeader(method, url, bodyParams = {}) {
  const {
    TWITTER_API_KEY: apiKey,
    TWITTER_API_SECRET: apiSecret,
    TWITTER_ACCESS_TOKEN: accessToken,
    TWITTER_ACCESS_TOKEN_SECRET: accessSecret,
  } = process.env;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter credentials not set. Need TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...bodyParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  const sigBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(sortedParams),
  ].join('&');

  const sigKey = `${percentEncode(apiSecret)}&${percentEncode(accessSecret)}`;
  const signature = crypto.createHmac('sha1', sigKey).update(sigBase).digest('base64');

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const headerStr = Object.keys(headerParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(', ');

  return `OAuth ${headerStr}`;
}

async function postTweet(text, options = {}) {
  const dryRun = options.dry_run || process.env.DRY_RUN === 'true';

  if (dryRun) {
    console.log('\n[DRY RUN] Would tweet:');
    console.log('─'.repeat(60));
    console.log(text);
    console.log('─'.repeat(60));
    return { id: 'dry-run-id', url: 'https://twitter.com/dry-run', dry_run: true };
  }

  const url = `${API_BASE}/tweets`;
  const body = { text };
  if (options.media_id) body.media = { media_ids: [options.media_id] };

  const authHeader = buildAuthHeader('POST', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Twitter API error ${res.status}: ${JSON.stringify(data)}`);
  }

  const tweetId = data.data?.id;
  return {
    id: tweetId,
    url: `https://twitter.com/i/web/status/${tweetId}`,
  };
}

module.exports = { postTweet };
