'use strict';

const { getAppStats }                              = require('./supabase-stats');
const { getBestPostingTime }                       = require('./scheduler');
const { getRecentPosts, savePostRecord }           = require('./state');
const { postTweet }                                = require('./twitter-client');
const { publishFeedPost, publishReel, getPostInsights } = require('./instagram-client');
const { createVideo, saveVideoForTikTok, buildRunwayPrompt, buildVideoScriptTemplate } = require('./video-generator');
const { BRAND, FEATURE_TIPS, CHAR_LIMITS }         = require('./content-templates');

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
      'Returns a structured video script template (15, 30, or 60 seconds) with section timings, hook examples, B-roll suggestions, and on-screen text tips. You fill in the actual script content.',
    input_schema: {
      type: 'object',
      properties: {
        duration_seconds: { type: 'number', enum: [15, 30, 60], description: 'Video duration' },
      },
      required: ['duration_seconds'],
    },
  },
  {
    name: 'create_video',
    description:
      'Generates a short-form video using the Runway Gen-3 Alpha Turbo API. If RUNWAY_API_KEY is set, actually generates and downloads the video. Otherwise returns a ready-to-use prompt for manual submission. Returns video_url and local_path on success.',
    input_schema: {
      type: 'object',
      properties: {
        prompt_text: {
          type: 'string',
          description: 'Description of the video content and key visual scenes (2-4 sentences)',
        },
        style: {
          type: 'string',
          enum: ['lifestyle_realistic', 'animated_bold', 'screen_recording_tutorial'],
          description: 'Visual style: lifestyle_realistic for grocery/people content, animated_bold for graphics, screen_recording_tutorial for app demos',
        },
        duration_seconds: {
          type: 'number',
          enum: [5, 10],
          description: 'Video clip duration (5 or 10 seconds)',
        },
      },
      required: ['prompt_text', 'style'],
    },
  },
  {
    name: 'publish_instagram_reel',
    description:
      'Posts a video as an Instagram Reel via the Graph API. Requires a publicly accessible video_url (use the video_url returned by create_video). Set dry_run: true to validate without posting.',
    input_schema: {
      type: 'object',
      properties: {
        video_url: { type: 'string', description: 'Publicly accessible .mp4 video URL' },
        caption: { type: 'string', description: 'Reel caption with hashtags (max 2200 chars)' },
        dry_run: { type: 'boolean', description: 'If true, log but do not post' },
      },
      required: ['video_url', 'caption'],
    },
  },
  {
    name: 'save_video_for_tiktok',
    description:
      'Saves a generated video and its caption to scripts/social-agent/tiktok-drafts/ for manual TikTok upload. Call this after create_video when you want to post to TikTok.',
    input_schema: {
      type: 'object',
      properties: {
        video_path: { type: 'string', description: 'Local file path returned by create_video' },
        caption: { type: 'string', description: 'TikTok caption with hashtags' },
        content_type: { type: 'string', description: 'Content angle used (e.g. app_launch, feature_tip)' },
      },
      required: ['video_path', 'caption', 'content_type'],
    },
  },
  {
    name: 'generate_image_prompt',
    description:
      'Creates an image generation prompt (DALL-E 3 or Stable Diffusion XL) for static social posts. Returns a ready-to-use prompt string.',
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
      'Posts an image to the ShelfCheck Instagram feed via the Graph API. For videos use publish_instagram_reel instead. Requires a publicly accessible image_url.',
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
      'Saves a record of a published (or drafted) post for future deduplication and analytics. Always call this after publishing or saving a draft.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['twitter', 'instagram', 'instagram_reel', 'tiktok'] },
        content_type: {
          type: 'string',
          enum: ['user_milestone', 'community_stat', 'feature_tip', 'store_content', 'lifestyle', 'app_launch', 'problem_awareness', 'app_discovery', 'video_script'],
        },
        excerpt: { type: 'string', description: 'First 120 chars of the post content' },
        post_url: { type: 'string', description: 'URL to the published post (if available)' },
        draft: { type: 'boolean', description: 'True if not actually published' },
        video_path: { type: 'string', description: 'Local path to video file (if applicable)' },
      },
      required: ['platform', 'content_type', 'excerpt'],
    },
  },
  {
    name: 'get_engagement_metrics',
    description:
      'Reads engagement data (likes, reach, impressions) for a past Instagram post to inform future content decisions.',
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

    case 'create_video':
      return await createVideo(
        input.prompt_text,
        input.style,
        input.duration_seconds || 10,
        { dry_run: input.dry_run }
      );

    case 'publish_instagram_reel':
      return await publishReel(input.video_url, input.caption, { dry_run: input.dry_run });

    case 'save_video_for_tiktok':
      return saveVideoForTikTok(input.video_path, input.caption, input.content_type);

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
        manual_instructions: 'Open ChatGPT or DALL-E 3, paste the dalle3_prompt, generate, and use as your post image.',
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
        video_path: input.video_path || null,
      });

    case 'get_engagement_metrics':
      return await getPostInsights(input.post_id);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { TOOLS, dispatchTool };
