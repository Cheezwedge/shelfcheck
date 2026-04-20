#!/usr/bin/env node
/**
 * ShelfCheck Social Media Marketing Agent
 *
 * Uses the Anthropic SDK agentic loop (claude-sonnet-4-6 + tool use) to
 * read live app stats, decide on a content angle, write social media copy,
 * and publish to Twitter/X and Instagram.
 *
 * Usage:
 *   node scripts/social-agent.js              # run normally (publishes if in window)
 *   DRY_RUN=true node scripts/social-agent.js # validate without publishing
 *   npm run social-agent
 *   npm run social-agent:dry-run
 *
 * Required in .env (or environment):
 *   ANTHROPIC_API_KEY
 *   EXPO_PUBLIC_SUPABASE_URL        (already present)
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY   (already present)
 *   TWITTER_API_KEY, TWITTER_API_SECRET
 *   TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 *   INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { TOOLS, dispatchTool } = require('./social-agent/tools');
const { BRAND, FEATURE_TIPS, TIKTOK_HOOKS } = require('./social-agent/content-templates');

// ─── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the ShelfCheck social media marketing agent. ShelfCheck is a community-powered grocery stock tracker for Los Angeles shoppers, available at ${BRAND.url}.

## Brand Voice
- Helpful and practical, never corporate or salesy
- Community-first language: "our community", "LA shoppers", "your neighbors"
- Emoji: moderate on Instagram/TikTok, minimal on Twitter
- Primary color: #1D9E75 (green) — represents freshness and community
- Always end posts with #ShelfCheck

## App Facts
- Covers 20 grocery chains in LA: Ralphs, Vons, Albertsons, Stater Bros., Trader Joe's, Whole Foods, Sprouts, Costco, Food 4 Less, Smart & Final, Pavilions, WinCo Foods, 99 Ranch Market, Northgate González, Walmart Neighborhood Market, Target, Aldi, Grocery Outlet, Bristol Farms, Gelson's
- Community earns points for submitting stock reports; 7 tiers: Newcomer → Helper → Scout → Trail Blazer → Expert → Champion → Legend
- Grocery list feature, store map, favorites sync, badge system
- Free to use, no ads

## Feature Tips Library
${FEATURE_TIPS.map((t, i) => `${i + 1}. ${t.tip}`).join('\n')}

## TikTok/Video Hooks
${TIKTOK_HOOKS.map((h, i) => `${i + 1}. ${h}`).join('\n')}

## Decision Sequence (follow this exactly every run)
1. Call get_app_stats → read leaderboard, report counts
2. Call get_recent_posts → check last 10 posts to avoid repetition
3. Call get_best_posting_time({ platform: "all" }) → check if now is optimal
4. Choose ONE content angle (priority order):
   a. user_milestone — someone hit a new tier or top leaderboard rank (highest engagement)
   b. community_stat — weekly/total report count milestone
   c. feature_tip — one specific feature explained clearly
   d. store_content — trending chain or store coverage
   e. lifestyle — relatable grocery shopping pain point + ShelfCheck solution
5. Write the post copy directly in your reasoning (do NOT call a separate tool for this)
6. Call publish_tweet with the finished Twitter copy
7. Call publish_instagram with the finished Instagram caption + an image prompt you describe
8. Optionally call generate_video_script + generate_video_prompt for a TikTok script
9. Call save_post_record for each published post
10. Summarize: what was posted, why that angle, and any engagement observations

## Guardrails
- Never publish more than 2 posts per platform per day (get_recent_posts will show if limit is hit)
- If get_best_posting_time says should_post: false for all platforms, generate drafts (save with draft: true) but do NOT call publish_tweet or publish_instagram
- Never mention specific prices or make stock availability guarantees
- Never tag specific usernames — reference anonymously ("one of our top reporters", "a community Legend")
- Twitter: max 280 characters
- Instagram: max 2200 characters, always end with 5-7 relevant hashtags

## Image Notes
When posting to Instagram, use a placeholder image URL for now unless you have a real hosted image.
A good placeholder: https://placehold.co/1080x1080/1D9E75/FFFFFF?text=ShelfCheck

Run now and complete the full sequence.`;

// ─── Agent loop ───────────────────────────────────────────────────────────────
async function runAgent() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('\nError: ANTHROPIC_API_KEY not set');
    console.error('Add it to .env or set it in your environment.\n');
    process.exit(1);
  }

  const isDryRun = process.env.DRY_RUN === 'true';
  if (isDryRun) {
    console.log('\n🌿 ShelfCheck Social Media Agent — DRY RUN MODE');
    console.log('   (No posts will actually be published)\n');
  } else {
    console.log('\n🌿 ShelfCheck Social Media Agent');
    console.log(`   ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} LA time\n`);
  }

  const client = new Anthropic({ apiKey });

  const messages = [
    { role: 'user', content: 'Run the ShelfCheck social media agent for today.' },
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 20;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    // Print any text the agent outputs
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log('\n' + block.text);
      }
    }

    if (response.stop_reason === 'end_turn') break;

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        console.log(`\n  → Tool: ${block.name}`);
        if (Object.keys(block.input).length > 0) {
          const preview = JSON.stringify(block.input).slice(0, 120);
          console.log(`     Input: ${preview}${preview.length >= 120 ? '...' : ''}`);
        }

        let result;
        try {
          result = await dispatchTool(block.name, block.input);
          const preview = JSON.stringify(result).slice(0, 160);
          console.log(`     Result: ${preview}${preview.length >= 160 ? '...' : ''}`);
        } catch (err) {
          console.error(`     Error: ${err.message}`);
          result = { error: err.message };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.warn('\nWarning: agent reached max iterations without completing.');
  }

  console.log('\n✓ Agent run complete.\n');
}

runAgent().catch((e) => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});
