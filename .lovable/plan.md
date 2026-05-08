
# Scaling the Ride Management System

## Current Problems

1. **Dashboard loads ALL rides at once** — `.range(0, 9999)` fetches up to 10,000 rides into memory on every page load. As data grows, this gets slower and eventually hits Supabase's response size limits.
2. **Client-side filtering** — all filtering (date, status, driver, search) happens in JavaScript after loading everything. With thousands of rides this freezes the UI.
3. **Bulk actions send many small requests** — batching in groups of 50 is better than one giant call, but still sequential and slow for large sets.
4. **No data archiving** — old completed rides stay in the active table forever, slowing every query.
5. **No pagination** — users see all rides on one page, which is slow to render.

---

## Plan

### 1. Server-Side Pagination and Filtering

Replace the "load everything" approach with paginated, server-filtered queries.

- Add a **server function** that accepts `page`, `pageSize`, `dateFilter`, `statusFilter`, `driverFilter`, and `search` parameters
- Query rides with `.range()` based on page number, applying all filters in the SQL query (not in JS)
- Return total count alongside the page data so the UI can show page numbers
- Default page size: 50 rides

### 2. Database Indexes for Common Queries

Add a composite index to speed up the most common dashboard query pattern:

- `(user_id, system, ride_date DESC, pickup_time)` — covers the main filtered + sorted query
- `(user_id, system, status)` — for status-filtered views
- `(user_id, system, driver_id, ride_date)` — for driver-filtered views

### 3. Optimized Bulk Operations

- **Bulk delete/update via server function** — move bulk operations to a server function that runs a single SQL statement (`DELETE FROM rides WHERE id = ANY($1)`) instead of multiple batched REST calls
- This is faster and avoids URL length limits entirely

### 4. Data Archiving Strategy

- Add an `archived` boolean column (default `false`) to rides
- Auto-archive rides older than 90 days with status `completed`/`cancelled`/`no_show` via a daily pg_cron job
- Dashboard only queries non-archived rides by default, with a toggle to view archived data
- This keeps the active dataset small and fast

### 5. Virtual Scrolling for Large Lists

- Replace the full ride list render with a virtualized list (using `@tanstack/react-virtual`)
- Only renders visible rows in the DOM, so even 1000+ results don't freeze the browser

### 6. Upload Optimization

- Show a progress bar during bulk imports
- Process XLSX parsing in a Web Worker so the UI doesn't freeze during large file parsing
- Batch inserts in groups of 100 rows per request (already partially done)

---

## Impact Summary

| Area | Before | After |
|------|--------|-------|
| Initial load | All rides (slow at 1000+) | 50 rides per page (instant) |
| Filtering | Client-side JS (freezes UI) | Server-side SQL (fast) |
| Bulk delete 500 rides | 10 sequential API calls | 1 server function call |
| DOM rendering | All rows in DOM | Only visible rows (virtual) |
| Old data | Always queried | Archived, excluded by default |

---

## Technical Details

**Files to modify:**
- `src/routes/dashboard.tsx` — pagination UI, server-side filter params, virtual list
- New server function file for paginated queries and bulk operations
- Database migration for `archived` column, new indexes, pg_cron archive job

**New dependencies:**
- `@tanstack/react-virtual` for virtualized list rendering

**No breaking changes** — existing data and workflows continue to work. Pagination is additive.
