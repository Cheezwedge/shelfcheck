'use strict';

const BASE = 'https://graph.facebook.com/v19.0';

function getCredentials() {
  const { INSTAGRAM_ACCESS_TOKEN: token, INSTAGRAM_USER_ID: userId } = process.env;
  if (!token || !userId) {
    throw new Error('Instagram credentials not set. Need INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID');
  }
  return { token, userId };
}

async function waitForContainer(containerId, token, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${BASE}/${containerId}?fields=status_code&access_token=${token}`
    );
    const data = await res.json();
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error(`Instagram container failed: ${JSON.stringify(data)}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Instagram container timed out waiting for FINISHED status');
}

async function publishFeedPost(imageUrl, caption, options = {}) {
  const dryRun = options.dry_run || process.env.DRY_RUN === 'true';

  if (dryRun) {
    console.log('\n[DRY RUN] Would post to Instagram (image):');
    console.log('─'.repeat(60));
    console.log('Image URL:', imageUrl);
    console.log('Caption:', caption.slice(0, 200) + (caption.length > 200 ? '...' : ''));
    console.log('─'.repeat(60));
    return { id: 'dry-run-id', type: 'image', dry_run: true };
  }

  const { token, userId } = getCredentials();

  const containerRes = await fetch(`${BASE}/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  });
  const containerData = await containerRes.json();
  if (!containerRes.ok) {
    throw new Error(`Instagram container creation failed: ${JSON.stringify(containerData)}`);
  }

  await waitForContainer(containerData.id, token);

  const publishRes = await fetch(`${BASE}/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerData.id, access_token: token }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok) throw new Error(`Instagram publish failed: ${JSON.stringify(publishData)}`);

  return { id: publishData.id, type: 'image' };
}

async function publishReel(videoUrl, caption, options = {}) {
  const dryRun = options.dry_run || process.env.DRY_RUN === 'true';

  if (dryRun) {
    console.log('\n[DRY RUN] Would post to Instagram Reels:');
    console.log('─'.repeat(60));
    console.log('Video URL:', videoUrl);
    console.log('Caption:', caption.slice(0, 200) + (caption.length > 200 ? '...' : ''));
    console.log('─'.repeat(60));
    return { id: 'dry-run-id', type: 'reel', dry_run: true };
  }

  const { token, userId } = getCredentials();

  // Reels require media_type: REELS and video_url
  const containerRes = await fetch(`${BASE}/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: true,
      access_token: token,
    }),
  });
  const containerData = await containerRes.json();
  if (!containerRes.ok) {
    throw new Error(`Instagram Reel container creation failed: ${JSON.stringify(containerData)}`);
  }

  console.log('  Processing Reel (this can take 30-90 seconds)...');
  await waitForContainer(containerData.id, token, 30);

  const publishRes = await fetch(`${BASE}/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerData.id, access_token: token }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok) throw new Error(`Instagram Reel publish failed: ${JSON.stringify(publishData)}`);

  return { id: publishData.id, type: 'reel' };
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

module.exports = { publishFeedPost, publishReel, getPostInsights };
