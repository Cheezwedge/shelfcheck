'use strict';

const { getAppStats }            = require('./supabase-stats');
const { getBestPostingTime }     = require('./scheduler');
const { getRecentPosts, savePostRecord } = require('./state');
const { postTweet }              = require('./twitter-client');
const { publishFeedPost, getPostInsights } = require('./instagram-client');
const { buildRunwayPrompt, buildVideoScriptTemplate } = require('./video-generator');
const { BRAND, FEATURE_TIPS, CHAR_LIMITS } = require('./content-templates');

// ─── Tool schemas (Anthropic SDK format) ─────────────────────────────────────

const TOOLS = [
  {
    name: 'get_app_stats',
    description:
      'Reads live ShelfCheck app data from Supabase: leaderboard top 10, total reports, weekly reports (last 7 days), and today\'s report count. Call this first on every run.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_recent_posts',
    description:
      'Returns the last 10 social posts published by this agent with timestamps, platforms, and content types. Use this to avoid repeating the same content angle.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent posts to return (default 10, max 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_best_posting_time',
    description:
      'Checks whether right now is an optimal time to post on the given platform based on LA timezone and minimum gap between posts. Returns should_post boolean and reason.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['twitter', 'instagram', 'tiktok', 'all'] },
      },
      required: ['platform'],
    },
  },
  {
    name: 'generate_video_script',
    description:
      'Returns a structured video script template for TikTok/Reels/Shorts (15, 30, or 60 seconds) with section timings, hook examples, B-roll suggestions, and on-screen text tips. You fill in the actual script content based on the chosen angle.',
    input_schema: {
      type: 'object',
      properties: {
        duration_seconds: { type: 'number', enum: [15, 30, 60], description: 'Video duration' },
      },
      required: ['duration_seconds'],
    },
  },
  {
    name: 'generate_video_prompt',
    description:
      'Creates a Runway Gen-3 Alpha Turbo prompt string for generating a short-form video clip. Phase 1: returns prompt text for manual submission. Set RUNWAY_API_KEY for automatic generation.',
    input_schema: {
      type: 'object',
      properties: {
        script_summary: { type: 'string', description: 'Key visual scenes from the video script (2-3 sentences)' },
        style: {
          type: 'string',
          enum: ['lifestyle_realistic', 'animated_bold', 'screen_recording_tutorial'],
          description: 'Visual style for the video',
        },
        duration_seconds: { type: 'number', description: 'Clip duration in seconds (default 8)' },
      },
      required: ['script_summary', 'style'],
    },
  },
  {
    name: 'generate_image_prompt',
    description:
      'Creates an image generation prompt for DALL-E 3 or Stable Diffusion XL for static social posts (Instagram feed, Twitter card). Returns a ready-to-use prompt string.',
    input_schema: {
      type: 'object',
      properties: {
        scene: { type: 'string', description: 'What the image should depict' },
        format: { type: 'string', enum: ['square_1x1', 'portrait_4x5', 'landscape_16x9'], default: 'square_1x1' },
      },
      required: ['scene'],
    },
  },
  {
    name: 'publish_tweet',
    description:
      'Posts a tweet to the ShelfCheck Twitter/X account. Returns the tweet URL on success. Set dry_run: true to validate without posting.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: `Tweet text including hashtags (max ${CHAR_LIMITS.twitter} chars)` },
        dry_run: { type: 'boolean', description: 'If true, log but do not post' },
      },
      required: ['text'],
    },
  },
  {
    name: 'publish_instagram',
    description:
      'Posts to the ShelfCheck Instagram account via the Graph API. Requires a publicly accessible image_url. Set dry_run: true to validate without posting.',
    input_schema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'Post caption with hashtags (max 2200 chars)' },
        image_url: { type: 'string', description: 'Publicly accessible image URL' },
        dry_run: { type: 'boolean', description: 'If true, log but do not post' },
      },
      required: ['caption', 'image_url'],
    },
  },
  {
    name: 'save_post_record',
    description:
      'Saves a record of a published (or drafted) post to the agent state file for future deduplication and analytics tracking. Always call this after publishing.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['twitter', 'instagram', 'tiktok'] },
        content_type: {
          type: 'string',
          enum: ['user_milestone', 'community_stat', 'feature_tip', 'store_content', 'lifestyle', 'video_script'],
        },
        excerpt: { type: 'string', description: 'First 120 chars of the post content' },
        post_url: { type: 'string', description: 'URL to the published post (if available)' },
        draft: { type: 'boolean', description: 'True if not actually published (outside posting window)' },
      },
      required: ['platform', 'content_type', 'excerpt'],
    },
  },
  {
    name: 'get_engagement_metrics',
    description:
      'Reads engagement data (likes, reach, impressions) for recent Instagram posts to inform future content decisions.',
    input_schema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Instagram media ID from a previous post record' },
      },
      required: ['post_id'],
    },
  },
];

// ─── Tool implementations ────────────────────────────────────────────────────

async function dispatchTool(name, input) {
  switch (name) {
    case 'get_app_stats':
      return await getAppStats();

    case 'get_recent_posts':
      return getRecentPosts(Math.min(input.limit || 10, 20));

    case 'get_best_posting_time':
      return getBestPostingTime(input.platform);

    case 'generate_video_script':
      return buildVideoScriptTemplate(input.duration_seconds);

    case 'generate_video_prompt':
      return buildRunwayPrompt(
        input.script_summary,
        input.style,
        { duration: input.duration_seconds }
      );

    case 'generate_image_prompt': {
      const formatMap = {
        square_1x1: '1:1 square',
        portrait_4x5: '4:5 portrait',
        landscape_16x9: '16:9 landscape',
      };
      const fmt = formatMap[input.format || 'square_1x1'];
      return {
        dalle3_prompt: `${input.scene}. Bright natural lighting, clean composition, community-focused warm feel. Green accent color #1D9E75. ${fmt} format. High quality, no text overlays, no logos.`,
        sdxl_prompt: `${input.scene}, natural lighting, warm tones, grocery store, Los Angeles, community, green #1D9E75 accent, photorealistic, ${fmt}, no text`,
        negative_prompt: 'text, watermarks, logos, dark, blurry, stock photo feel, corporate',
        format: fmt,
        manual_instructions: `Open ChatGPT or DALL-E, paste the dalle3_prompt, generate, download, and use as your post image.`,
      };
    }

    case 'publish_tweet':
      return await postTweet(input.text, { dry_run: input.dry_run });

    case 'publish_instagram':
      return await publishFeedPost(input.image_url, input.caption, { dry_run: input.dry_run });

    case 'save_post_record':
      return savePostRecord({
        platform: input.platform,
        content_type: input.content_type,
        excerpt: (input.excerpt || '').slice(0, 120),
        post_url: input.post_url || null,
        draft: input.draft || false,
      });

    case 'get_engagement_metrics':
      return await getPostInsights(input.post_id);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { TOOLS, dispatchTool };
