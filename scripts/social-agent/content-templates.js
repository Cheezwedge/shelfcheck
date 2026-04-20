'use strict';

const BRAND = {
  name: 'ShelfCheck',
  url: 'https://shelfcheckapp.com',
  primaryColor: '#1D9E75',
  tagline: 'Find it before you drive there.',
  coreHashtags: ['#ShelfCheck', '#LAGrocery'],
  contextualHashtags: {
    tips: ['#GroceryShopping', '#LAFoodie', '#GroceryHacks'],
    milestone: ['#CommunityWin', '#ShelfCheckLegend'],
    community: ['#LAShoppers', '#GroceryCommunity'],
    tiktok: ['#GroceryTok', '#LALife', '#ShopSmart'],
  },
};

const TWITTER_TEMPLATES = {
  user_milestone: (ctx) =>
    `Someone just hit ${ctx.tier} status on ShelfCheck 🌿 That's ${ctx.reports} confirmed reports helping LA shoppers find what they need.\n\n${BRAND.url} #ShelfCheck #CommunityWin`,

  community_stat: (ctx) =>
    `${Number(ctx.count).toLocaleString()} stock reports submitted by the ShelfCheck community this week.\n\nReal shoppers. Real stores. Real-time.\n\n${BRAND.url} #ShelfCheck #LAGrocery`,

  feature_tip: (ctx) =>
    `💡 ${ctx.tip}\n\nTry it → ${BRAND.url}\n#ShelfCheck`,

  store_content: (ctx) =>
    `Heading to ${ctx.chain} in LA? Check ShelfCheck first — our community has submitted real stock reports so you know what's on the shelves before you leave home.\n\n${BRAND.url} #ShelfCheck #LAGrocery`,

  lifestyle: (ctx) =>
    `Stop wasting grocery runs. ${ctx.hook}\n\nShelfCheck has community stock reports for 20 grocery chains across LA.\n\n${BRAND.url} #ShelfCheck #GroceryShopping`,
};

const INSTAGRAM_TEMPLATES = {
  user_milestone: (ctx) =>
    `The ShelfCheck community just hit a new milestone 🏆\n\nOne of our top shoppers has now submitted over ${ctx.reports} confirmed stock reports — helping thousands of LA families shop smarter every single day.\n\nThat's the power of community. Every report you submit (and earn points for) helps your neighbors know what's actually on the shelves before they make the drive.\n\nWant in? Find your nearest store at the link in bio 🌿\n\n#ShelfCheck #LAGrocery #CommunityWin #GroceryShopping #ShelfCheckLegend #LAFoodie #GroceryHacks`,

  community_stat: (ctx) =>
    `${Number(ctx.count).toLocaleString()} reports submitted this week by LA shoppers just like you 🌟\n\nEvery time someone checks a shelf and reports what they find, it helps the whole community shop smarter.\n\nThat's ShelfCheck. Community-powered grocery intel, completely free.\n\n🔗 Link in bio\n\n#ShelfCheck #LAGrocery #LAShoppers #GroceryCommunity #ShopSmart #LALife #GroceryShopping`,

  feature_tip: (ctx) =>
    `Did you know? 💡\n\n${ctx.tip}\n\nShelfCheck covers 20 grocery chains across Los Angeles — Ralphs, Vons, Trader Joe's, 99 Ranch, Costco, and more.\n\n🔗 Link in bio\n\n#ShelfCheck #LAGrocery #GroceryHacks #LAFoodie #ShopSmart #GroceryShopping #LALife`,

  lifestyle: (ctx) =>
    `${ctx.hook} 🛒\n\nWith ShelfCheck, you can check community stock reports for your nearest grocery store before you leave home. No more wasted trips. No more empty shelves surprises.\n\n20 chains covered. Free forever.\n\n🔗 Link in bio\n\n#ShelfCheck #LAGrocery #GroceryTok #LALife #ShopSmart #GroceryShopping #LAFoodie`,
};

const TIKTOK_HOOKS = [
  "POV: You drive to the grocery store and they're out of stock. Again.",
  'LA grocery hack you didn\'t know you needed 👇',
  'I stopped wasting trips to the grocery store and here\'s how',
  'The app that LA shoppers are using to never waste a grocery trip again',
  'Stocking up for the week? Check this before you leave 🛒',
  'Tell me you\'re an LA shopper without telling me you\'re an LA shopper',
  'Things I wish I knew before moving to LA: the grocery store edition',
];

const FEATURE_TIPS = [
  {
    tip: 'You can check stock at any LA grocery store before leaving home — Ralphs, Vons, Trader Joe\'s, 99 Ranch, Costco and 15 more chains.',
    feature: 'store_coverage',
  },
  {
    tip: 'ShelfCheck reports are community-sourced and confirmed within 4 hours. The more reports, the more accurate the data.',
    feature: 'accuracy',
  },
  {
    tip: 'Earn points and unlock badges for every confirmed stock report. Reach Legend tier for a gold name on the community leaderboard.',
    feature: 'gamification',
  },
  {
    tip: 'Favorite your go-to stores and they sync across devices automatically once you\'re signed in.',
    feature: 'favorites',
  },
  {
    tip: 'The built-in grocery list lets you build a checklist per store and check off items as you shop.',
    feature: 'grocery_list',
  },
  {
    tip: 'Stock report freshness is shown visually — the more recent the report, the more you can trust it.',
    feature: 'freshness',
  },
];

const VIDEO_SCRIPT_STRUCTURE = {
  15: { hook_seconds: 3, content_seconds: 9, cta_seconds: 3 },
  30: { hook_seconds: 3, content_seconds: 22, cta_seconds: 5 },
  60: { hook_seconds: 5, content_seconds: 45, cta_seconds: 10 },
};

const CHAR_LIMITS = {
  twitter: 280,
  instagram_caption: 2200,
  tiktok_caption: 2200,
};

module.exports = {
  BRAND,
  TWITTER_TEMPLATES,
  INSTAGRAM_TEMPLATES,
  TIKTOK_HOOKS,
  FEATURE_TIPS,
  VIDEO_SCRIPT_STRUCTURE,
  CHAR_LIMITS,
};
