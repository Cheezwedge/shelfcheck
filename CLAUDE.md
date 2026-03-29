# ShelfCheck — Claude Context

## Project Overview
Expo/React Native app that lets users find nearby grocery stores on a map, build per-store grocery lists, and check item availability. Deployed to GitHub Pages as a static web app.

**Live URL:** https://cheezwedge.github.io/shelfcheck/

## Stack
- Expo SDK 52 / Expo Router v4
- React Native Web (web export only, no native build needed)
- `react-leaflet` + `leaflet` for the store map (web only)
- OpenStreetMap Overpass API for nearby store search (no API key required)
- Nominatim for zip code → lat/lon geocoding
- `localStorage` for grocery list persistence
- Supabase (Postgres + PostgREST + Auth) for stock reports, item catalog, and user accounts

## Branch & Deploy Flow

**Dev branch:** `claude/generate-preview-Y7lCy`
**Deploy branch:** `gh-pages` (GitHub Pages serves from this)

### Every deploy must follow these steps exactly:
```bash
# 1. Build
npx expo export --platform web

# 2. Check old bundle name (in repo root)
ls _expo/static/js/web/ | grep entry

# 3. Check new bundle name (in dist/)
ls dist/_expo/static/js/web/ | grep entry

# 4. Remove old bundle, copy new dist
git rm -f _expo/static/js/web/entry-<OLD_HASH>.js
cp -r dist/. .

# 5. Stage
git add -f _expo/ index.html metadata.json

# 6. Commit & push to both branches
git commit -m "description"
git push -u origin claude/generate-preview-Y7lCy
git push origin claude/generate-preview-Y7lCy:gh-pages --force
```

**Critical:** Always remove the old bundle before copying new dist. If multiple old bundles accumulate, GitHub Pages will 404. The `index.html` must point to the exact current bundle hash.

## Key Files

| File | Purpose |
|------|---------|
| `app/(tabs)/_layout.tsx` | Tab bar (Shop, Scan, Rewards) |
| `app/(tabs)/index.tsx` | Shop screen — store picker + grocery list + stock status |
| `app/(tabs)/scan.tsx` | Receipt scan screen |
| `app/(tabs)/rewards.tsx` | User rewards/points screen |
| `app/report/[id].tsx` | Report stock status for an item |
| `app/admin/index.tsx` | Admin item management (sort, badge new items, all-chains view) |
| `components/StorePicker.tsx` | Store search UI: zip input, radius, chain filters, map+list |
| `components/StoreMap.web.tsx` | Leaflet map (web only, platform-specific file) |
| `components/StoreMap.tsx` | Native fallback (returns null) |
| `lib/api.ts` | Supabase API: fetchItems, submitReport, upsertItem, upsertStore, fetchAdminItems |
| `lib/types.ts` | Shared types: ItemRow, LiveItem, AdminItem, StockStatus |
| `lib/stores.ts` | Overpass API queries, CHAINS constant, matchChain(), searchStoresByName() |
| `lib/groceryList.ts` | localStorage grocery list CRUD (addItem, toggleItem, changeQuantity, etc.) |
| `lib/sampleItems.ts` | 10 sample items per chain (BY_CHAIN + GENERIC fallback) |
| `lib/auth.ts` | useAuth() hook — session, isGuest, signOut |
| `supabase/migrations/` | SQL migration history (001–008) |

## Grocery List Architecture
- Lists are stored in `localStorage` keyed by `supabaseId ?? storeName`
- `GroceryListItem` has: `id, itemId, name, category, quantity, checked, addedAt, checkedAt`
- Old items without `quantity` field are migrated to `quantity: 1` in `getList()`
- `addItem()` increments quantity if an unchecked duplicate exists (no duplicates)
- History = items where `checked === true`; never deleted unless explicitly cleared

## Store Map Architecture
- Platform-specific: `.web.tsx` uses Leaflet, `.tsx` is a null native fallback
- `filteredStores` in `StorePicker.tsx` **must** be wrapped in `useMemo` — without it, every hover re-creates the array, triggering map rebuild and re-zoom
- Leaflet popups use `autoPan: false` to prevent map re-centering on hover
- Callback refs (`onHoverRef`, `onSelectRef`) prevent stale closures in Leaflet event handlers
- Map height is drag-resizable (default 260px, min 100, max 520)

## Allowed Store Chains
Only 20 chains are shown (filtered via `matchChain()` keyword matching):
Ralphs, Vons, Albertsons, Stater Bros., Trader Joe's, Whole Foods, Sprouts, Costco, Food 4 Less, Smart & Final, Pavilions, WinCo Foods, 99 Ranch Market, Northgate González, Walmart Neighborhood Market, Target, Aldi, Grocery Outlet, Bristol Farms, Gelson's

Overpass query includes `shop=wholesale` (Costco) and `shop=department_store` (Target) in addition to `supermarket`/`grocery`.

## Coding Conventions
- No TypeScript strict mode issues — keep types accurate
- Platform-specific files: use `.web.tsx` suffix for web-only code
- No backend — everything is localStorage or public APIs
- Don't add error boundaries, loading skeletons, or retry logic beyond what exists
- Mobile-first layout: inputs use `flex: 1, minWidth: 0` to prevent overflow on small screens
- Safe area / tab bar: account for tab bar height (~50px) when positioning absolute elements at the bottom

## Known Gotchas
- `npx expo export` may print "Something prevented Expo from exiting, forcefully exiting now" — this is normal, build succeeds
- GitHub Pages 404s are almost always caused by a stale bundle filename in `index.html` or multiple bundles in `_expo/static/js/web/`
- The `gh-pages` branch must always be force-pushed from the dev branch (they stay in sync)
- Leaflet CSS must be loaded via `<link>` in a `useEffect` or it won't render correctly on web
