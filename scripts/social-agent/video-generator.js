'use strict';

const fs   = require('fs');
const path = require('path');
const { BRAND, VIDEO_SCRIPT_STRUCTURE, TIKTOK_HOOKS } = require('./content-templates');

const RUNWAY_API_BASE    = 'https://api.runwayml.com/v1';
const RUNWAY_API_VERSION = '2024-11-06';
const DRAFTS_DIR         = path.join(__dirname, 'tiktok-drafts');

const STYLE_DESCRIPTIONS = {
  lifestyle_realistic:
    'cinematic lifestyle footage, natural warm lighting, shallow depth of field, 4K quality, authentic feel, real people in grocery stores',
  animated_bold:
    'bold animated motion graphics, bright colors, kinetic typography, modern flat design, energetic',
  screen_recording_tutorial:
    'clean screen recording with smooth cursor movements, zoomed highlights, minimal UI, light background',
};

// ─── Runway API ───────────────────────────────────────────────────────────────

async function submitRunwayJob(promptText, durationSeconds, style) {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error('RUNWAY_API_KEY not set');

  const styleDesc = STYLE_DESCRIPTIONS[style] || STYLE_DESCRIPTIONS.lifestyle_realistic;
  const fullPrompt = `${promptText}. ${styleDesc}. Green accent color ${BRAND.primaryColor}, community-focused. Vertical 9:16 video for TikTok/Reels.`;

  const res = await fetch(`${RUNWAY_API_BASE}/text_to_video`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_API_VERSION,
    },
    body: JSON.stringify({
      model: 'gen3a_turbo',
      promptText: fullPrompt,
      duration: durationSeconds <= 5 ? 5 : 10,
      ratio: '768:1344',
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Runway submit failed: ${JSON.stringify(data)}`);
  return data.id;
}

async function pollRunwayTask(taskId, timeoutMs = 300000) {
  const apiKey = process.env.RUNWAY_API_KEY;
  const start = Date.now();
  const POLL_INTERVAL = 5000;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': RUNWAY_API_VERSION,
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Runway poll failed: ${JSON.stringify(data)}`);

    if (data.status === 'SUCCEEDED') {
      const videoUrl = data.output?.[0];
      if (!videoUrl) throw new Error('Runway succeeded but returned no output URL');
      return videoUrl;
    }
    if (data.status === 'FAILED') throw new Error(`Runway generation failed: ${data.failure ?? 'unknown error'}`);

    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error('Runway task timed out after 5 minutes');
}

async function downloadVideo(videoUrl, filename) {
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(DRAFTS_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function createVideo(promptText, style, durationSeconds = 10, options = {}) {
  const dryRun = options.dry_run || process.env.DRY_RUN === 'true';
  const hasRunwayKey = !!process.env.RUNWAY_API_KEY;

  if (dryRun || !hasRunwayKey) {
    const promptResult = buildRunwayPrompt(promptText, style, { duration: durationSeconds });
    return {
      generated: false,
      reason: dryRun ? 'dry_run' : 'RUNWAY_API_KEY not set',
      prompt_ready: true,
      ...promptResult,
    };
  }

  console.log('\n  Submitting to Runway Gen-3 Alpha Turbo...');
  const taskId = await submitRunwayJob(promptText, durationSeconds, style);
  console.log(`  Task ID: ${taskId} — polling for completion`);

  const videoUrl = await pollRunwayTask(taskId);
  console.log(`\n  Video ready: ${videoUrl}`);

  // Download a local copy for TikTok
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const localPath = await downloadVideo(videoUrl, `shelfcheck-${timestamp}.mp4`);

  return {
    generated: true,
    video_url: videoUrl,
    local_path: localPath,
    task_id: taskId,
    duration_seconds: durationSeconds,
    style,
  };
}

function saveVideoForTikTok(videoPath, caption, contentType) {
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });

  const base = path.basename(videoPath, '.mp4');
  const captionPath = path.join(DRAFTS_DIR, `${base}-caption.txt`);
  const captionContent = [
    `Content type: ${contentType}`,
    `Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} LA time`,
    '',
    '── TIKTOK CAPTION ──',
    caption,
    '',
    '── UPLOAD INSTRUCTIONS ──',
    '1. Open TikTok on your phone',
    '2. Tap + → Upload → select the .mp4 file',
    '3. Paste the caption above',
    '4. Add #ShelfCheck and relevant hashtags',
    '5. Post during peak hours: 7-9am, 12-2pm, or 7-9pm LA time',
  ].join('\n');

  fs.writeFileSync(captionPath, captionContent);
  return { video_path: videoPath, caption_path: captionPath, drafts_dir: DRAFTS_DIR };
}

function buildRunwayPrompt(scriptSummary, style, options = {}) {
  const styleDesc = STYLE_DESCRIPTIONS[style] || STYLE_DESCRIPTIONS.lifestyle_realistic;

  return {
    runway_prompt: `${scriptSummary}. ${styleDesc}. Green accent color ${BRAND.primaryColor}, clean and community-focused. Vertical 9:16 video for TikTok/Reels.`,
    negative_prompt: 'blurry, text overlays, watermarks, dark, overly corporate, stock footage clichés',
    duration_seconds: options.duration || 10,
    aspect_ratio: '9:16',
    style_preset: style,
    manual_instructions: [
      '1. Add RUNWAY_API_KEY to your .env file (get one at app.runwayml.com)',
      '2. Re-run the agent — it will auto-generate and download the video',
      '   OR manually: go to app.runwayml.com → Gen-3 Alpha Turbo → Text to Video',
      '3. Paste the runway_prompt, set ratio to 9:16, generate and download',
    ].join('\n'),
  };
}

function buildVideoScriptTemplate(durationSeconds) {
  const structure = VIDEO_SCRIPT_STRUCTURE[durationSeconds] || VIDEO_SCRIPT_STRUCTURE[30];
  return {
    duration_seconds: durationSeconds,
    structure,
    sections: [
      {
        name: 'HOOK',
        duration_seconds: structure.hook_seconds,
        purpose: 'Stop the scroll. Open with a relatable pain point or surprising fact.',
        example_hooks: TIKTOK_HOOKS.slice(0, 3),
        instructions: 'Write 1-2 punchy sentences. On-screen text should match voiceover.',
      },
      {
        name: 'CONTENT',
        duration_seconds: structure.content_seconds,
        purpose: 'Show the solution. Demonstrate ShelfCheck solving the problem.',
        instructions: `Break into ${Math.ceil(structure.content_seconds / 8)} short segments. Each = one clear benefit. Keep sentences under 10 words.`,
      },
      {
        name: 'CTA',
        duration_seconds: structure.cta_seconds,
        purpose: 'Drive action. Direct viewers to visit the app.',
        instructions: `End with: "Link in bio → ${BRAND.url}"`,
      },
    ],
    on_screen_text_tips: [
      'Bold white text with dark drop shadow',
      `Accent color for key words: ${BRAND.primaryColor}`,
      'Max 6 words per frame',
      'Always add captions — 85% of TikTok watched without sound',
    ],
    b_roll_suggestions: [
      'Person checking phone in parking lot before entering grocery store',
      'Empty store shelf, disappointed expression',
      'App screen showing green "In Stock" indicator',
      'Person smiling, cart full, successful shopping trip',
      'Overhead shot of grocery cart in colorful produce aisle',
    ],
  };
}

module.exports = { createVideo, saveVideoForTikTok, buildRunwayPrompt, buildVideoScriptTemplate };
