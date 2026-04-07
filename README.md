# ShelfCheck

**ShelfCheck** is a community-powered grocery availability tracker. Find nearby stores, check whether items are in stock, and contribute reports to help other shoppers in your area.

**Live app:** [shelfcheckapp.com](https://shelfcheckapp.com)

---

## Features

- **Store finder** — Search by zip code and radius. View stores on an interactive map or in a list. Filter by chain.
- **Grocery lists** — Build a per-store shopping list. Add items, check them off, track history.
- **Stock reporting** — Submit in-store availability reports (In Stock / Low Stock / Out of Stock). Reports are confirmed after 4 hours if no conflicting reports are submitted.
- **Rewards & levels** — Earn points for confirmed reports. Level up through 7 tiers (Newcomer → Legend) with perks at each level.
- **Badges** — Unlock achievement badges for report volume, accuracy, streaks, and leaderboard rank.
- **Leaderboard** — See the top contributors in the community.
- **Favorite stores** — Star your go-to stores. Favorites sync across devices when signed in.
- **Account system** — Sign up with email, set a display name, track your stats and badge collection.

## Tiers & Perks

| Level | Tier | Points | Perk |
|-------|------|--------|------|
| 1 | Newcomer | 0 | Community access & grocery list |
| 2 | Helper | 100 | Your reports appear first in item history |
| 3 | Scout | 300 | See view counts on your reports |
| 4 | Trail Blazer | 600 | "Verified Reporter" badge on your reports |
| 5 | Expert | 1,000 | Early access to new chain rollouts |
| 6 | Champion | 1,500 | Reports auto-confirm instantly (no 4h wait) |
| 7 | Legend | 2,500 | Gold name on the leaderboard + exclusive badge |

## Supported Store Chains

Ralphs · Vons · Albertsons · Stater Bros. · Trader Joe's · Whole Foods · Sprouts · Costco · Food 4 Less · Smart & Final · Pavilions · WinCo Foods · 99 Ranch Market · Northgate González · Walmart Neighborhood Market · Target · Aldi · Grocery Outlet · Bristol Farms · Gelson's

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 52 / Expo Router v4 |
| UI | React Native Web |
| Map | react-leaflet + Leaflet (OpenStreetMap) |
| Store search | OpenStreetMap Overpass API |
| Geocoding | Nominatim (zip → lat/lon) |
| Database & Auth | Supabase (Postgres + PostgREST + Auth) |
| Local storage | `localStorage` (grocery lists, favorites cache) |
| Hosting | GitHub Pages (static web export) |

## Project Structure

```
app/
  (tabs)/
    _layout.tsx       # Tab bar with account sheet
    index.tsx         # Shop screen — store picker + grocery list
    scan.tsx          # Receipt scan screen
    rewards.tsx       # Rewards, badges, leaderboard
  report/[id].tsx     # Submit a stock report for an item
  auth.tsx            # Sign in / sign up flow
  admin/index.tsx     # Admin item management

components/
  StorePicker.tsx         # Store search UI (zip, radius, chain filters)
  StoreMap.web.tsx        # Leaflet map (web only)
  AccountSheet.tsx        # Account dropdown menu
  TierProgressModal.tsx   # Level progression bottom sheet

lib/
  api.ts          # All Supabase calls
  auth.tsx        # Auth context & hooks
  tiers.ts        # Tier definitions & progress logic
  badges.ts       # Badge metadata & unlock logic
  groceryList.ts  # localStorage CRUD for grocery lists
  stores.ts       # Overpass queries, chain matching, favorites

supabase/
  migrations/     # SQL migration history (001–014)

scripts/
  migrate.js      # Runs pending migrations via Supabase Management API
```

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
echo 'EXPO_PUBLIC_SUPABASE_URL=https://uvxuwlskpofdypwvdoxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key>' > .env

# Start dev server
npx expo start --web
```

## Deployment

The app is deployed as a static site to GitHub Pages.

```bash
# Build
npx expo export --platform web --clear
cp dist/index.html dist/404.html

# Swap bundle, then push
git push origin claude/generate-preview-Y7lCy:gh-pages --force
```

The `404.html` copy enables client-side SPA routing — GitHub Pages serves it for any unknown path, and Expo Router handles navigation from there.

## Database Migrations

Migrations live in `supabase/migrations/` and are tracked in a `_migrations` table in the database. A GitHub Actions workflow runs pending migrations automatically on every push to the dev branch.

To run migrations manually:
```bash
SUPABASE_ACCESS_TOKEN=<token> node scripts/migrate.js
```

---

## Contributing

Stock reports are the core of ShelfCheck — the more people report, the more useful it becomes for everyone. Sign up at [shelfcheckapp.com](https://shelfcheckapp.com) to start contributing.
