'use strict';

const { BRAND, VIDEO_SCRIPT_STRUCTURE, TIKTOK_HOOKS } = require('./content-templates');

// Phase 1: returns prompts for manual Runway submission.
// Phase 2: set RUNWAY_API_KEY to auto-submit via Runway Gen-3 Alpha Turbo API.

const STYLE_DESCRIPTIONS = {
  lifestyle_realistic:
    'cinematic lifestyle footage, natural warm lighting, shallow depth of field, 4K quality, authentic feel, no stock photo look',
  animated_bold:
    'bold animated motion graphics, bright colors, kinetic typography, modern flat design, energetic',
  screen_recording_tutorial:
    'clean screen recording with smooth cursor movements, zoomed highlights, minimal UI, light background',
};

function buildRunwayPrompt(scriptSummary, style, options = {}) {
  const styleDesc = STYLE_DESCRIPTIONS[style] || STYLE_DESCRIPTIONS.lifestyle_realistic;
  const aspectRatio = options.aspect_ratio || '9:16';
  const colorAccent = BRAND.primaryColor;

  return {
    runway_prompt: `${scriptSummary}. ${styleDesc}. Green accent color ${colorAccent}, clean and community-focused. Aspect ratio ${aspectRatio}, vertical video for TikTok/Reels.`,
    negative_prompt: 'blurry, text overlays, watermarks, dark, overly corporate, stock footage clichés, jump cuts',
    duration_seconds: options.duration || 8,
    aspect_ratio: aspectRatio,
    style_preset: style,
    manual_instructions: [
      '1. Go to app.runwayml.com → Gen-3 Alpha Turbo',
      '2. Select "Text to Video" or "Image to Video"',
      '3. Paste the runway_prompt above',
      '4. Set aspect ratio to 9:16',
      '5. Generate and download',
      '6. Upload to TikTok/Instagram Reels with the caption from the agent',
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
        instructions: 'Write 1-2 punchy sentences. On-screen text should match the voiceover.',
      },
      {
        name: 'CONTENT',
        duration_seconds: structure.content_seconds,
        purpose: 'Show the solution. Demonstrate ShelfCheck solving the problem.',
        instructions: `Break into ${Math.ceil(structure.content_seconds / 8)} short segments. Each segment = one clear benefit or feature. Keep sentences under 10 words each.`,
      },
      {
        name: 'CTA',
        duration_seconds: structure.cta_seconds,
        purpose: 'Drive action. Direct viewers to download or visit the app.',
        instructions: `End with: "Link in bio → ${BRAND.url}" or "Search ShelfCheck on your browser"`,
      },
    ],
    on_screen_text_tips: [
      'Use bold white text with dark drop shadow for readability',
      `Accent color for key words: ${BRAND.primaryColor}`,
      'Keep text to max 6 words per frame',
      'Add captions — 85% of TikTok watched without sound',
    ],
    b_roll_suggestions: [
      'Person checking phone in parking lot before entering grocery store',
      'Empty store shelf with disappointed expression',
      'App screen showing green "In Stock" status',
      'Person smiling, cart full, successful shopping trip',
      'Overhead shot of grocery cart in aisle',
    ],
  };
}

module.exports = { buildRunwayPrompt, buildVideoScriptTemplate };
