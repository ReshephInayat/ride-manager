I found the May 2026 PDF structure clearly shows the correct table order:

```text
DATE | DEPARTMENT | #RIDERS | PICK UP: Location | PICK UP: From | PICK UP: Pickup Date/Time | DROP OFF: Location | DROP OFF: To
```

So for each row:
- `pickup_location` must come from the first Location column under PICK UP.
- `pickup_from` must come from the From column under PICK UP.
- `pickup_time` must come from Pickup Date/Time.
- `dropoff_location` must come from the second Location column under DROP OFF.
- `dropoff_to` must come from the To column under DROP OFF.
- Dropoff time should be extracted from the trailing time inside `dropoff_to`, e.g. `AS 2368-01 May 07:55` means dropoff time is `01 May 07:55`.
- For return rides where `pickup_from` is a flight like `AS 2189-02 May 20:53` and `dropoff_to` is `Delta Hotels Seattle Everett`, pickup is still the flight/airport side and dropoff is still the hotel side because that is exactly how the PDF columns define it.

Plan to fix this properly:

1. Replace the fragile AI-only table interpretation with deterministic PDF table extraction
   - Update `src/lib/rides.ts` so PDF parsing preserves text coordinates from `pdfjs` instead of flattening the page into plain text only.
   - Group text items into table rows by Y position and sort columns left-to-right by X position.
   - Convert rows directly into ride objects using the known Horizon schedule column order.
   - Carry down blank dates / rowspan dates from the previous row, including across pages.
   - Use the schedule title to determine the year and normalize dates to `YYYY-MM-DD`.

2. Keep AI as fallback, not the primary parser
   - If coordinate parsing fails for a page, then call the existing `parse-rides-pdf` backend AI function as a fallback.
   - Strengthen the AI prompt with examples from this May 2026 PDF.
   - Make the prompt state that the app must respect the exact column order, not infer or swap origin/destination.

3. Add strict validation before preview/import
   - Validate every extracted row against the source row shape before it reaches the preview modal.
   - Reject or flag rows where:
     - pickup time is missing or not a time/date-time value,
     - pickup/dropoff fields look shifted into the wrong columns,
     - `pickup_from` / `dropoff_to` were swapped compared with the table columns,
     - date carry-down failed.
   - Add a visible warning in the import preview for any row that needs review instead of silently importing bad data.

4. Fix pickup/dropoff route matching so it no longer hides parser mistakes
   - Update `autoMatchRoute` so the strict route match only matches pickup route to pickup fields and dropoff route to dropoff fields.
   - Remove the current strict behavior that accepts reversed pickup/dropoff as a match, because that can make swapped data look correct.
   - Keep a separate loose fallback only for pricing, but it must not rewrite ride pickup/dropoff values.

5. Improve dropoff time handling in the UI
   - Continue storing the PDF's `dropoff_to` text exactly as shown.
   - Extract and display dropoff time from `dropoff_to` consistently in admin dashboard, driver cards, and preview.
   - In the preview table, show both pickup time and dropoff time so wrong rows are obvious before import.

6. Add May 2026 parser reference checks
   - Use the uploaded May 2026 schedule as the reference format.
   - Add representative checks for rows like:
     - `01-May-2026`: Pickup `PAE / Delta Hotels Seattle Everett / 01 May 07:35`, Dropoff `PAE / AS 2368-01 May 07:55`.
     - `02-May-2026`: Pickup `PAE / AS 2189-02 May 20:53 / 02 May 20:53`, Dropoff `PAE / Delta Hotels Seattle Everett`.
     - `31-May-2026`: Pickup `PAE / AS 2083-31 May 22:41 / 31 May 22:41`, Dropoff `PAE / Delta Hotels Seattle Everett`.
   - This will make the parser enforce the same rules for future monthly Horizon PDFs.

7. Optional data correction for already-imported bad rides
   - I will not automatically modify existing imported rides unless you want that.
   - After the parser is fixed, I can add a safe repair step for rides imported from the affected PDF/source file, but that should be done carefully so manually edited rides are not overwritten.

Expected result:
- New imports from this May 2026 PDF should create 80 rides, matching the PDF total.
- Pickup and dropoff columns will follow the PDF table exactly.
- Pickup time and dropoff time will display correctly.
- The import should also be faster and more reliable because most pages will parse locally instead of waiting for AI on every page.