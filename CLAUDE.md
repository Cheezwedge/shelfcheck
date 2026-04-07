# ShelfCheck — Claude Context

## Project Overview
Expo/React Native app that lets users find nearby grocery stores on a map, build per-store grocery lists, and check item availability. Deployed to GitHub Pages as a static web app.

**Live URL:** https://shelfcheckapp.com/

## Environment Setup (required before every build)
The `.env` file is gitignored and must be recreated each session:
```
EXPO_PUBLIC_SUPABASE_URL=https://uvxuwlskpofdypwvdoxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2eHV3bHNrcG9mZHlwd3Zkb3h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjkwNDIsImV4cCI6MjA4OTkwNTA0Mn0.NjRNKefHE9aA62NTtZprkKR43Hx4QH4iZVQASo5nxhI
```
Always use `npx expo export --platform web --clear` to prevent stale cached bundles.

## Stack
- Expo SDK 52 / Expo Router v4
- React Native Web (web export only, no native build needed)
- `react-leaflet` + `leaflet` for the store map (web only)
- OpenStreetMap Overpass API for nearby store search (no API key required)
- Nominatim for zip code → lat/lon geocoding
- `localStorage` for grocery list + favorites persistence
- Supabase (Postgres + PostgREST + Auth) for stock reports, item catalog, user accounts, and favorites sync

## Branch & Deploy Flow

**Dev branch:** `claude/generate-preview-Y7lCy`
**Deploy branch:** `gh-pages` (GitHub Pages serves from this)

### Every deploy must follow these steps exactly:
```bash
# 1. Build
npx expo export --platform web --clear

# 2. Create 404.html for SPA routing (prevents refresh 404s on sub-routes)
cp dist/index.html dist/404.html

# 3. Check old bundle name (in repo root)
ls _expo/static/js/web/ | grep entry

# 4. Check new bundle name (in dist/)
ls dist/_expo/static/js/web/ | grep entry

# 5. Remove old bundle, copy new dist
git rm -f _expo/static/js/web/entry-<OLD_HASH>.js
cp -r dist/. .

# 6. Stage
git add -f _expo/ index.html 404.html metadata.json

# 7. Commit & push to both branches
git commit -m "description"
git push -u origin claude/generate-preview-Y7lCy
git push origin claude/generate-preview-Y7lCy:gh-pages --force
```

**Critical:** Always remove the old bundle before copying new dist. If multiple old bundles accumulate, GitHub Pages will 404. The `index.html` must point to the exact current bundle hash.

## Key Files & What They Export

### Screens
| File | Purpose & Key Exports |
|------|----------------------|
| `app/(tabs)/_layout.tsx` | Tab bar layout. Imports `AccountSheet`. Opens sheet via `sheetOpen` state on avatar button press. |
| `app/(tabs)/index.tsx` | Shop screen. State: `selectedStore`, `listItems`, `isFav`. Reloads list on `[sk, session]` change. Guest gate on add-item. |
| `app/(tabs)/rewards.tsx` | Rewards/profile screen. State: `profile`, `leaderboard`, `showTierProgress`, `showAvatarPicker`, `editingName`. |
| `app/(tabs)/scan.tsx` | Receipt scan screen (placeholder). |
| `app/report/[id].tsx` | Report stock for an item. Params: `id, name, category, storeName, storeAddress`. Guest-gated. Checks `needsUsername` before showing form. |
| `app/auth.tsx` | Auth flow: sign-in, sign-up, email confirm waiting screen, display-name step. State: `pendingConfirmEmail`, `pendingUserId`. |
| `app/admin/index.tsx` | Admin item management. |

### Components
| File | Purpose |
|------|---------|
| `components/StorePicker.tsx` | Store search: zip input, radius, chain filters, map+list. Syncs favorites with DB on open if logged in. |
| `components/StoreMap.web.tsx` | Leaflet map (web only). `filteredStores` **must** be in `useMemo` or map re-zooms on every hover. |
| `components/StoreMap.tsx` | Native fallback (returns null). |
| `components/AccountSheet.tsx` | Dropdown account menu modal. Shows profile/tier/points, inline display-name editor, sign-out. Guest: shows sign-in CTA. |
| `components/TierProgressModal.tsx` | Bottom-sheet modal. Vertical timeline of all 7 tiers with lock state, animated pulse on current tier, perk per tier, progress bar. Props: `visible, onClose, points`. |

### Lib
| File | Key Exports |
|------|-------------|
| `lib/api.ts` | `fetchItems(storeId)`, `submitReport(...)`, `upsertItem(...)`, `upsertStore(...)`, `fetchAdminItems()`, `fetchProfile(userId)`, `updateUsername(uid, name)`, `fetchLeaderboard(limit)`, `fetchFavoritesFromDB(uid)`, `upsertFavoriteInDB(uid, store)`, `removeFavoriteFromDB(uid, osmId)`, `confirmPendingPoints()` |
| `lib/auth.tsx` | `AuthProvider`, `useAuth()` → `{session, user, isGuest, isAdmin, loading, signIn, signUp, signOut, claimGuestPoints}`. On `SIGNED_OUT`: calls `clearFavorites()` + `clearAllLists()`. `signUp` passes `emailRedirectTo: 'https://shelfcheckapp.com'`. |
| `lib/types.ts` | `ItemRow`, `LiveItem`, `AdminItem`, `StockStatus` |
| `lib/stores.ts` | `CHAINS`, `matchChain()`, `searchStoresByName()`, `getFavorites()`, `toggleFavorite()`, `clearFavorites()` — favorites stored in localStorage under `shelfcheck:favorites` |
| `lib/groceryList.ts` | `getList(sk)`, `addItem(sk, item)`, `toggleItem(sk, id)`, `changeQuantity(sk, id, delta)`, `removeItem(sk, id)`, `reAddItem(sk, id)`, `clearHistory(sk)`, `clearAllLists()` — storage key `shelfcheck_grocery_lists` |
| `lib/sampleItems.ts` | `BY_CHAIN` map + `GENERIC` fallback (10 items per chain) |
| `lib/tiers.ts` | `TIERS[]` (7 tiers, each with `level, label, min, next, color, bg, icon, perk, perkIcon, animated?`), `getTier(points)`, `tierProgress(points)` |
| `lib/badges.ts` | `ALL_BADGES[]`, `earnedBadges(profile)`, `featuredBadge(badges)`, `heroColor(badges)`, `RARITY_COLORS`, `RARITY_LABELS` |
| `lib/identity.ts` | `getDeviceId()` — stable UUID in localStorage |
| `lib/supabase.ts` | `supabase` client |

## Data Architecture

### Supabase tables
- `profiles` — `id (uuid), username, points, pending_points, reports_count, is_admin, featured_badge_id`
- `reports` — `id, item_id, store_id, user_id, status, created_at`. Unique index: one per (item, user, UTC date). Points are pending for 4h then confirmed via `confirm_pending_reports()` RPC.
- `items` — chain-level catalog. `fetch_store_items(p_store_id)` RPC returns chain-filtered items with current status.
- `favorite_stores` — `user_id, osm_id, name, address`. Synced from localStorage on StorePicker open.

### Grocery List
- `localStorage` key: `shelfcheck_grocery_lists` → `Record<storeKey, GroceryListItem[]>`
- `storeKey` = `store.supabaseId ?? store.name`
- `GroceryListItem`: `{id, itemId, name, category, quantity, checked, addedAt, checkedAt}`
- Cleared entirely on sign-out via `clearAllLists()`

### Auth Flow
- Guest: `session === null`, uses device UUID for reporting
- Sign-up: if email confirmation required → `pendingConfirmEmail` screen. After confirm → display-name step via `pendingUserId`.
- Sign-out: clears favorites + grocery lists from localStorage

## Tiers & Perks (7 levels)
1. **Newcomer** (0 pts) — baseline access
2. **Helper** (100 pts) — reports appear first in item history
3. **Scout** (300 pts) — see view counts on reports
4. **Trail Blazer** (600 pts) — "Verified Reporter" badge on reports
5. **Expert** (1000 pts) — early access to new chain rollouts
6. **Champion** (1500 pts) — reports auto-confirm instantly
7. **Legend** (2500 pts) — gold name on leaderboard + exclusive badge

## Migrations
- Files in `supabase/migrations/` (001–014)
- `scripts/migrate.js` runs pending migrations via Supabase Management API
- Tracks applied migrations in `_migrations` DB table
- GitHub Actions (`.github/workflows/migrate.yml`) auto-runs on push to dev branch

## Store Map Architecture
- `filteredStores` in `StorePicker.tsx` **must** be in `useMemo` — without it, every hover re-creates the array, triggering map rebuild and re-zoom
- Leaflet popups use `autoPan: false` to prevent map re-centering on hover
- Callback refs (`onHoverRef`, `onSelectRef`) prevent stale closures in Leaflet event handlers
- Map height is drag-resizable (default 260px, min 100, max 520)

## Allowed Store Chains (20)
Ralphs, Vons, Albertsons, Stater Bros., Trader Joe's, Whole Foods, Sprouts, Costco, Food 4 Less, Smart & Final, Pavilions, WinCo Foods, 99 Ranch Market, Northgate González, Walmart Neighborhood Market, Target, Aldi, Grocery Outlet, Bristol Farms, Gelson's

Overpass query includes `shop=wholesale` (Costco) and `shop=department_store` (Target) in addition to `supermarket`/`grocery`.

## Coding Conventions
- No TypeScript strict mode issues — keep types accurate
- Platform-specific files: use `.web.tsx` suffix for web-only code
- No backend — everything is localStorage or public Supabase APIs
- Don't add error boundaries, loading skeletons, or retry logic beyond what exists
- Mobile-first layout: inputs use `flex: 1, minWidth: 0` to prevent overflow
- Tab bar height ~50px — account for it when positioning absolute elements at the bottom
- New modals: use `Modal` with `transparent animationType="fade"` + `TouchableWithoutFeedback` backdrop
- New bottom sheets: use `position: absolute, bottom: 0` with `borderTopLeftRadius/borderTopRightRadius: 24`
- Colors: primary green `#1D9E75`, text `#111827`, secondary text `#6B7280`, border `#E5E7EB`, destructive `#EF4444`

## Known Gotchas
- `npx expo export` may print "Something prevented Expo from exiting, forcefully exiting now" — this is normal, build succeeds
- GitHub Pages 404s are almost always caused by a stale bundle filename in `index.html` or multiple bundles in `_expo/static/js/web/`
- The `gh-pages` branch must always be force-pushed from the dev branch (they stay in sync)
- Leaflet CSS must be loaded via `<link>` in a `useEffect` or it won't render correctly on web
- `Alert.alert` on web maps to `window.alert` — use a `Modal` component for multi-button dialogs on web
- Supabase realtime subscriptions: always call `supabase.removeChannel(channel)` in the useEffect cleanup
