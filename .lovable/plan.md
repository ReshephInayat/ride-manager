I’ll recreate the import flow around a stricter, database-backed duplicate system and fix the missing ride count issue.

Plan:

1. Replace fragile client-only import logic with a dedicated import function
- Add a backend import function that receives the extracted PDF rides and inserts them in controlled batches.
- The function will return exact counts: extracted, valid, inserted, skipped duplicates, skipped invalid.
- The dashboard toast/preview will show those numbers clearly so you can verify the full PDF count.

2. Make duplicate detection strict and consistent
- Keep/store `ride_key` on every ride.
- Generate `ride_key` from normalized values:
  - ride date
  - pickup time
  - pickup location / pickup-from
  - dropoff location / dropoff-to
  - passenger name/email/phone
  - flight number
- Normalize before key creation:
  - trim spaces
  - lowercase text
  - collapse repeated spaces
  - normalize phone punctuation where possible
  - normalize flight numbers like `AS 2270` / `ASA2270` consistently
  - normalize pickup time to stable `HH:MM`
- Enforce the unique rule in the database so duplicates cannot be inserted even if the UI fails.

3. Fix the likely reason first import is missing rides
- The current dashboard loads rides with no explicit range, so the backend can return only the default limited result set when ride volume grows.
- Change ride loading to paged database reads or a high safe range so the dashboard total reflects all rides, not just a partial fetch.
- Keep the visible table pagination so the screen does not become infinite scrolling.

4. Improve PDF extraction reliability
- Update the parser instructions to preserve every row and return a `row_number`/source marker when possible.
- Stop silently dropping parsed rows with missing fields in the preview; instead show invalid rows separately/count them, so “177 extracted” does not become a smaller import with no explanation.
- Validate only the minimum required fields for import, and report which rows are skipped.

5. Add duplicate cleanup/backfill migration if needed
- Backfill `ride_key` for existing rides using the new normalization logic.
- Remove any duplicates already created, keeping the most important record first: completed/no-show/arrived, assigned rides, then oldest record.
- Recreate/confirm the unique database constraint on `(user_id, system, ride_key)`.

6. Update dashboard import UI
- Preview header will show:
  - extracted rides from PDF
  - importable rides
  - already-existing duplicates
  - invalid rows
- Import button will insert only importable, non-duplicate rides.
- Re-uploading the same PDF should show zero inserted and all valid rides skipped as duplicates.

Technical details:
- I will not edit the generated backend client/types files manually.
- Database changes will be done through a migration.
- The duplicate protection will be enforced at database level, not only in JavaScript.
- The final behavior target is:
  - First upload of the April PDF imports all valid rides from the parser output.
  - Second upload of the exact same PDF imports 0 rides.
  - The dashboard total matches what is actually stored after import.