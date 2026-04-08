# ShelfCheck — App Specification

This document contains everything needed to rebuild ShelfCheck from scratch in a fresh session.

---

## 1. Purpose & Domain

**ShelfCheck** is a crowdsourced grocery inventory app (mobile-first, also runs on web via Expo). Users report real-time stock status of items at a grocery store and earn points/rewards for their contributions. Engagement is driven by a leveling system and achievement badges.

**Core value prop:** Community-powered real-time shelf availability at physical stores, with gamified incentives.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo 52 (React Native 0.76.9, React 18.3.1) |
| Navigation | Expo Router 4.0 (file-based, typed routes) |
| Language | TypeScript 5.3 |
| Backend | Supabase (Postgres + Realtime + Auth) |
| Supabase client | @supabase/supabase-js ^2.100.0 |
| Icons | @expo/vector-icons 14 (Ionicons) |
| Styling | React Native StyleSheet (no CSS-in-JS) |
| Web deploy | Vercel (SPA rewrite) |
| Build | Babel (babel-preset-expo) |

**Environment variables (Expo convention):**
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

---

## 3. File Structure

```
/
├── app/
│   ├── _layout.tsx              # Root Stack layout, wraps AuthProvider
│   ├── auth.tsx                 # Auth modal (sign in / sign up / claim points)
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tab navigator (3 tabs)
│   │   ├── index.tsx            # Home — inventory list
│   │   ├── scan.tsx             # Scan receipt (UI only)
│   │   └── rewards.tsx          # Rewards, levels, achievements
│   └── report/
│       └── [id].tsx             # Dynamic report screen (card modal)
├── lib/
│   ├── supabase.ts              # Supabase client init
│   ├── api.ts                   # Data fetching & submission functions
│   ├── auth.tsx                 # AuthContext + useAuth hook
│   ├── types.ts                 # TypeScript interfaces
│   └── identity.ts              # Guest device UUID (localStorage)
├── data.ts                      # Status colors, labels, time formatting
├── app.json                     # Expo config (bundle ID, icons, etc.)
├── package.json
├── tsconfig.json
├── babel.config.js
├── vercel.json                  # { "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
├── supabase-schema.sql
├── supabase-profiles-migration.sql
└── supabase-auth-migration.sql
```

---

## 4. Database Schema (Supabase / PostgreSQL)

### Tables

#### `stores`
```sql
create table stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  created_at timestamptz default now()
);
```

#### `items`
```sql
create table items (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references stores(id) on delete cascade,
  name       text not null,
  category   text not null,
  created_at timestamptz default now()
);
create index items_store_id_idx on items(store_id);
```

#### `reports`
```sql
create table reports (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  status     text not null check (status in ('in-stock', 'out-of-stock')),
  user_id    uuid,   -- nullable; guest UUID or auth.uid()
  created_at timestamptz default now()
);
create index reports_item_created_idx on reports(item_id, created_at desc);
```

#### `profiles`
```sql
create table profiles (
  id            uuid primary key,  -- guest device UUID or auth.uid()
  points        int default 0,
  reports_count int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
```

### View

#### `items_with_status`
Denormalizes the most recent report for each item:
```sql
create or replace view items_with_status as
select
  i.*,
  r.status,
  r.created_at as last_reported_at
from items i
left join lateral (
  select status, created_at
  from reports
  where item_id = i.id
  order by created_at desc
  limit 1
) r on true;
```

### RLS Policies
- `stores`, `items`: public SELECT only
- `reports`: public SELECT + INSERT
- `profiles`: public SELECT, INSERT, UPDATE (auth migration tightens UPDATE policy)

### Triggers & Functions

#### `handle_new_report()` — fires AFTER INSERT on `reports`
```sql
create or replace function handle_new_report()
returns trigger language plpgsql security definer as $$
begin
  if new.user_id is not null then
    insert into profiles (id, points, reports_count)
    values (new.user_id, 10, 1)
    on conflict (id) do update
      set points        = profiles.points + 10,
          reports_count = profiles.reports_count + 1,
          updated_at    = now();
  end if;
  return new;
end;
$$;

create trigger on_report_inserted
  after insert on reports
  for each row execute function handle_new_report();
```

#### `merge_guest_profile(guest_id uuid, auth_id uuid)` — called after sign-up
```sql
create or replace function merge_guest_profile(guest_id uuid, auth_id uuid)
returns void language plpgsql security definer as $$
declare
  guest_points int;
  guest_reports int;
begin
  -- Security: caller must be the auth user
  if auth.uid() != auth_id then
    raise exception 'Unauthorized';
  end if;

  select points, reports_count into guest_points, guest_reports
  from profiles where id = guest_id;

  if not found then return; end if;

  -- Transfer to auth account
  insert into profiles (id, points, reports_count)
  values (auth_id, guest_points, guest_reports)
  on conflict (id) do update
    set points        = profiles.points + excluded.points,
        reports_count = profiles.reports_count + excluded.reports_count,
        updated_at    = now();

  -- Re-attribute historical reports
  update reports set user_id = auth_id where user_id = guest_id;

  -- Remove guest profile
  delete from profiles where id = guest_id;
end;
$$;
```

### Seed Data

One store, five items (fixed UUIDs for local development):

```sql
insert into stores (id, name, address) values (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Whole Foods Market – Downtown',
  '123 Main Street'
);

insert into items (id, store_id, name, category) values
  ('item-uuid-1', 'a1b2c3d4-0000-0000-0000-000000000001', 'Organic Whole Milk',      'Dairy'),
  ('item-uuid-2', 'a1b2c3d4-0000-0000-0000-000000000001', 'Sourdough Bread',          'Bakery'),
  ('item-uuid-3', 'a1b2c3d4-0000-0000-0000-000000000001', 'Free-Range Eggs (12ct)',   'Dairy'),
  ('item-uuid-4', 'a1b2c3d4-0000-0000-0000-000000000001', 'Baby Spinach (5oz)',        'Produce'),
  ('item-uuid-5', 'a1b2c3d4-0000-0000-0000-000000000001', 'Greek Yogurt (Plain)',      'Dairy');
```

---

## 5. Authentication

### Dual-mode system

**Guest mode (default)**
- Device UUID generated via `crypto.randomUUID()` on first load, stored in `localStorage` under key `shelfcheck_device_id`.
- Guests can submit reports and earn points; everything tracked under their UUID in `profiles`.

**Authenticated mode**
- Supabase Auth — email + password only.
- Session persisted in `localStorage`, auto-refreshed.
- `AuthContext` (React context) manages the session and exposes `useAuth()` hook.

**Guest → Authenticated migration (post sign-up)**
1. After successful sign-up, check if guest UUID has a profile with points.
2. If yes, show a modal: "Claim your X points earned as a guest?" (with Skip option).
3. On accept, call `merge_guest_profile(guestId, authId)` RPC.
4. On skip, guest points remain unclaimed.

**Reporting user ID:** `session?.user.id ?? getDeviceId()`

---

## 6. Screens & Features

### Tab 1 — Home (`/`)
- Lists all items for `DEFAULT_STORE_ID` using the `items_with_status` view.
- Each item card shows:
  - Name and category
  - Status badge: **In Stock** (green) / **Out of Stock** (red) / **Uncertain** (amber, when no reports)
  - Time since last report: "5m ago", "2h ago", "No reports yet"
- Top of screen: live sync indicator ("Live" / "Syncing"), plus count summary cards (In Stock / Out of Stock / Uncertain totals).
- Search bar to filter items by name.
- Tapping an item navigates to `/report/[id]`.
- **Realtime:** subscribes to INSERT on `reports`; re-fetches items on any new report.

### Tab 2 — Scan Receipt (`/scan`)
- Informational screen explaining the receipt-scanning feature (not yet implemented in backend).
- Shows earning mechanics: 25 pts base + 5 pts per verified item.
- Two CTA buttons (camera / file upload) — placeholders only.
- 4-step "How It Works" guide.

### Tab 3 — Rewards (`/rewards`)
- **Points card:** current points balance + level name.
- **Level progression bar** toward next level threshold.
- **Stats:** reports submitted, points earned, levels unlocked.
- **Achievements grid** (6 badges, unlocked by `reports_count`):

| Badge | Requirement |
|---|---|
| First Report | 1 report |
| Speed Scout | 5 reports |
| Dedicated | 10 reports |
| Top Contributor | 25 reports |
| Streak Master | 50 reports |
| Store Explorer | 100 reports |

- **Redeem Rewards** section (3 tiers, UI only — no backend fulfillment):

| Reward | Points Cost | Condition |
|---|---|---|
| $2 off | 200 pts | Orders $20+ |
| $5 off | 500 pts | Orders $40+ |
| Free Delivery | 1000 pts | One delivery order |

- If not signed in: sign-in banner to sync points across devices.
- Account/sign-out button in header (filled icon = authenticated, outline = guest).
- **Realtime:** subscribes to profile changes; live-updates points and report count.

### Report Item (`/report/[id]`)
- Card modal (presented over current screen).
- Shows item name and category icon.
- Two large buttons: **In Stock** / **Out of Stock**.
- Evidence section (UI placeholders — not functional):
  - Shelf photo (+15 pts bonus)
  - Receipt scan (+15 pts bonus)
- Point note: "+10 points for this report".
- On submit: inserts row into `reports`; shows success overlay ("+10 pts!") for 1.6 s then auto-dismisses.

### Auth Modal (`/auth`)
- Toggle between Sign In and Create Account.
- Email field + password field (min 6 chars).
- "Continue as Guest" button.
- Post-signup guest points claim flow (see §5).

---

## 7. Business Logic

### Points System
| Action | Points |
|---|---|
| Submit a report | +10 |
| Upload a receipt (planned) | +25 base |
| Verified receipt item (planned) | +5 each |
| Shelf photo evidence (planned) | +15 |
| Receipt photo evidence (planned) | +15 |

Points are incremented by the `handle_new_report` database trigger (not by client-side logic).

### Levels
| Level | Name | Points Required |
|---|---|---|
| 1 | Newcomer | 0 |
| 2 | Helper | 100 |
| 3 | Scout | 300 |
| 4 | Trail Blazer | 600 |
| 5 | Expert | 1000 |
| 6 | Champion | 1500 |

### Item Status
Derived from the single most recent report for that item:
- `in-stock` → **In Stock**
- `out-of-stock` → **Out of Stock**
- No reports → **Uncertain**

---

## 8. Data Layer (`lib/api.ts`)

Key functions:
- `fetchItems(storeId)` — queries `items_with_status` filtered by `store_id`; returns `LiveItem[]`
- `fetchProfile(userId)` — queries `profiles` by id
- `submitReport(itemId, status, userId)` — inserts into `reports`
- `getReportingUserId(session)` — returns `session?.user.id ?? getDeviceId()`

---

## 9. TypeScript Types (`lib/types.ts`)

```ts
export type ItemStatus = 'in-stock' | 'out-of-stock' | null;

export interface ItemRow {
  id: string;
  store_id: string;
  name: string;
  category: string;
  created_at: string;
}

export interface LiveItem extends ItemRow {
  status: ItemStatus;
  last_reported_at: string | null;
}

export interface Profile {
  id: string;
  points: number;
  reports_count: number;
}
```

---

## 10. Shared Utilities (`data.ts`)

- `STATUS_COLORS` — maps status → `{ bg, text, border }` color tokens
- `STATUS_LABELS` — maps status → display string ("In Stock", "Out of Stock", "Uncertain")
- `formatTimeAgo(isoString)` — human-readable relative time ("5m ago", "2h ago", "3d ago")

---

## 11. Color Palette

| Token | Hex | Usage |
|---|---|---|
| Primary green | `#1D9E75` | CTAs, active tab, success |
| In Stock | `#1D9E75` | Status badge |
| Out of Stock | `#E53935` | Status badge |
| Uncertain / amber | `#F59E0B` | Status badge, loading |
| Text primary | `#111827` | |
| Text secondary | `#6B7280` | |
| Text muted | `#9CA3AF` | |
| Border | `#E5E7EB` | |
| Surface | `#F9FAFB` | Card backgrounds |
| Green tint bg | `#ECFDF5` | Accent areas |
| Red tint bg | `#FEF2F2` | Accent areas |

---

## 12. App Config (`app.json` key values)

```json
{
  "expo": {
    "name": "ShelfCheck",
    "slug": "shelfcheck",
    "version": "1.0.0",
    "scheme": "shelfcheck",
    "ios": { "bundleIdentifier": "com.shelfcheck.app", "supportsTablet": true },
    "android": { "package": "com.shelfcheck.app" },
    "web": { "bundler": "metro", "output": "single" },
    "plugins": ["expo-router"],
    "experiments": { "typedRoutes": true }
  }
}
```

---

## 13. Known Limitations / Planned Features

- **Single store hardcoded** (`DEFAULT_STORE_ID`). Multi-store support requires a store picker and passing `store_id` through the navigation/query layer.
- **Receipt scanning** — upload buttons exist but OCR/item-extraction backend not built.
- **Rewards redemption** — point costs are defined but no fulfillment backend (coupon codes, order API integration).
- **Native persistence** — currently uses `localStorage` for device UUID and session. Native iOS/Android builds need `expo-secure-store`.
- **Camera / photo evidence** — UI placeholders only; requires `expo-image-picker` + storage bucket integration.
- **Push notifications** — not implemented; would use `expo-notifications`.
