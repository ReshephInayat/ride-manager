
# Complete UI Redesign — Dark Luxury Aesthetic

This is a full visual overhaul of every page in the app. All existing functionality (data fetching, ride management, driver login, invoicing, etc.) remains unchanged — only the presentation layer changes.

## Scope

~4,000 lines across 12+ files will be rewritten or heavily modified. The work breaks down into these phases:

---

## Phase 1: Design System Foundation

**Files: `src/styles.css`, `src/routes/__root.tsx`**

- Replace all CSS custom properties in `:root` and `.dark` with the specified color palette (#080810 bg, #10101C card, #18182A elevated, etc.)
- Import Plus Jakarta Sans + JetBrains Mono from Google Fonts
- Add global utility classes: card hover effects, gradient buttons, skeleton shimmer animation, thin custom scrollbars, page transition animations
- Update toast configuration to bottom-right positioning with dark card styling and colored left borders
- Add backdrop blur styles for modals

## Phase 2: Landing Page (Home)

**File: `src/routes/index.tsx`**

- Full-screen dark hero with cinematic limo background + #080810 overlay at 65%
- Navbar with "Puget Sound Limo" + gold "RIDE MANAGER" subtitle + green "Live dispatch" pill
- Feature badge: "Two systems. One dispatch." glass pill
- Hero heading: 64px "Premium rides," white + "effortlessly managed." gold
- Two login cards side-by-side: Admin (gold shield, amber accent) + Driver (indigo car accent), 20px border-radius, hover glow
- Bottom feature strip: 3 dark glass pills
- Mobile: hero image hidden, heading 36px, cards stack, pills stack, 20px padding

## Phase 3: Admin Login Page

**File: `src/routes/login.tsx`**

- Desktop: 50/50 split — left dark limo image with overlay + heading/features, right #080810 with centered #10101C form card (20px radius, 48px padding)
- "Welcome back" heading, dark inputs (#18182A bg, #6C63FF focus ring), indigo gradient Sign In button
- Mobile: left panel hidden, full-screen form with logo at top

## Phase 4: Driver Login Page

**File: `src/routes/driver.tsx` (login section)**

- Same split layout but gold theme
- Gold shield icon circle, workspace dropdown, large centered PIN input (letter-spacing 12px, 48px height)
- Gold gradient sign-in button
- Mobile: left panel hidden, full-screen gold-accented form

## Phase 5: Admin Sidebar & AppShell

**File: `src/components/AppShell.tsx`**

- Desktop (1025px+): Fixed left sidebar 240px, #08080F bg, company logo + gold subtitle, grouped nav (Main/Management/Billing/System), active item indigo pill + left glow, bottom: theme toggle + notification bell + user avatar
- Tablet (641-1024px): Collapsed icon-only 64px sidebar
- Mobile (<=640px): No sidebar. Fixed bottom tab bar (#08080F, 60px, 5 tabs: Dashboard/Rides/Calendar/Invoices/More). "More" opens slide-up drawer. Active = indigo icon + gold dot. Main content gets padding-bottom: 72px

## Phase 6: Admin Dashboard

**File: `src/routes/dashboard.tsx`**

- KPI row: 4 cards (Total Rides, Weekly Revenue, Active Drivers, Pending) — 4-col desktop, 2x2 tablet/mobile, colored left borders, trend badges
- Charts: Revenue area chart (indigo gradient) 60% left + donut chart 40% right desktop, stack on mobile
- Recent rides table: dark themed, alternating rows, status pills, action icons on hover
- Mobile: table converts to card layout
- Skeleton loaders on all data loads
- Empty states with icon + message + CTA

## Phase 7: Driver Dashboard (Ride Cards)

**File: `src/routes/driver.tsx` (dashboard section)**

- Header: driver name + workspace left, bell + sign out right (icon only on mobile)
- Stats row: 3 cards with gold left-border on "Today" — horizontally scrollable on mobile (scroll-snap)
- Filter tabs: pill group, indigo active, horizontally scrollable on mobile
- Ride cards: #10101C, 16px radius, date pill + status badge top, pickup/dropoff columns desktop → stacked mobile
- Action buttons: row on desktop → 2x2 grid on mobile, 44px min height
- 14px card padding on mobile

## Phase 8: Remaining Pages

**Calendar** (`src/routes/calendar.tsx`): Dark theme, day/week toggle pills, today column highlight, mobile defaults to day view, FAB above bottom tab bar

**Invoices** (`src/routes/invoices.index.tsx`, `src/routes/invoices.$id.tsx`): Summary bar (3 stats), dark invoice cards, generate button indigo gradient, mobile stacking

**Drivers** (`src/routes/drivers.tsx`): 3-col → 2-col → 1-col grid, dark cards with avatar initials (indigo bg), PIN show/hide, active toggle, slide-over for add (full-screen mobile)

**Routes & Pricing** (`src/routes/routes.index.tsx`, `src/routes/routes.$id.tsx`): Dark table, inline edit mode, green price text, mobile expandable rows

**Logs** (`src/routes/logs.tsx`): #050508 bg, monospace font, level badges (INFO indigo/WARN amber/ERROR red), search + filter, 13px → 12px mobile

**Rides Detail** (`src/routes/rides.$id.tsx`): Dark themed detail view

## Phase 9: Supporting Components

- `src/components/NotificationBell.tsx` / `DriverNotificationBell.tsx`: Dark themed
- `src/components/ChatAssistant.tsx`: Dark themed chat
- `src/components/TrackRideDialog.tsx`: Dark modal with blur backdrop
- `src/components/RequireAuth.tsx`: Loading skeleton update
- All shadcn/ui components inherit from CSS variables (automatic via Phase 1)

## Technical Details

- All colors flow through CSS custom properties, so shadcn/ui components automatically pick up the new palette
- Plus Jakarta Sans loaded via Google Fonts link in `__root.tsx` head
- JetBrains Mono loaded for logs page only
- No new dependencies needed (existing Tailwind + shadcn covers everything)
- Responsive breakpoints enforced via Tailwind: `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px)
- All existing business logic, data fetching, auth flows, and Supabase integrations remain untouched
- Estimated ~12-15 files modified
