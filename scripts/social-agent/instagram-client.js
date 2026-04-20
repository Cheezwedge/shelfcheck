'use strict';

const BASE = 'https://graph.facebook.com/v19.0';

function getCredentials() {
  const { INSTAGRAM_ACCESS_TOKEN: token, INSTAGRAM_USER_ID: userId } = process.env;
  if (!token || !userId) {
    throw new Error('Instagram credentials not set. Need INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID');
  }
  return { token, userId };
}

async function waitForContainer(containerId, token, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${BASE}/${containerId}?fields=status_code&access_token=${token}`
    );
    const data = await res.json();
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error(`Instagram container failed: ${JSON.stringify(data)}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Instagram container timed out waiting for FINISHED status');
}

async function publishFeedPost(imageUrl, caption, options = {}) {
  const dryRun = options.dry_run || process.env.DRY_RUN === 'true';

  if (dryRun) {
    console.log('\n[DRY RUN] Would post to Instagram:');
    console.log('─'.repeat(60));
    console.log('Image URL:', imageUrl);
    console.log('Caption:', caption.slice(0, 200) + (caption.length > 200 ? '...' : ''));
    console.log('─'.repeat(60));
    return { id: 'dry-run-id', dry_run: true };
  }

  const { token, userId } = getCredentials();

  // Step 1: Create media container
  const containerRes = await fetch(`${BASE}/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  });
  const containerData = await containerRes.json();
  if (!containerRes.ok) {
    throw new Error(`Instagram container creation failed: ${JSON.stringify(containerData)}`);
  }
  const containerId = containerData.id;

  // Step 2: Wait for container to be ready
  await waitForContainer(containerId, token);

  // Step 3: Publish
  const publishRes = await fetch(`${BASE}/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok) {
    throw new Error(`Instagram publish failed: ${JSON.stringify(publishData)}`);
  }

  return { id: publishData.id };
}

async function getPostInsights(mediaId, options = {}) {
  const dryRun = options.dry_run || process.env.DRY_RUN === 'true';
  if (dryRun) return { impressions: 0, reach: 0, likes: 0, dry_run: true };

  const { token } = getCredentials();
  const metrics = 'impressions,reach,likes';
  const res = await fetch(
    `${BASE}/${mediaId}/insights?metric=${metrics}&access_token=${token}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Instagram insights failed: ${JSON.stringify(data)}`);

  const result = {};
  for (const item of data.data ?? []) {
    result[item.name] = item.values?.[0]?.value ?? 0;
  }
  return result;
}

module.exports = { publishFeedPost, getPostInsights };
