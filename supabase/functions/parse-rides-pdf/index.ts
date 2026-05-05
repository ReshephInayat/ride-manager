// Parses extracted Horizon Air schedule page text and returns ride rows.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileName, pageNumber, totalPages, pageText, documentContext } = await req.json();
    if (!pageText) {
      return json({ error: "pageText required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    const prompt = `You are a strict data extractor for Horizon Air Ground Transportation Schedules.
You are processing page ${pageNumber ?? "?"} of ${totalPages ?? "?"} from a file named "${fileName ?? "schedule.pdf"}".

════════════════════════════════════════════════════════
SECTION 1 — WHAT YOU MUST RETURN
════════════════════════════════════════════════════════
Return ONLY valid JSON in this exact shape, with no prose, no markdown, no code fences:
{"rides":[...]}

Each ride object must have these fields:
  ride_date        — string, YYYY-MM-DD. MANDATORY. Never null, never missing.
  department       — string or null  (e.g. "Flight (2)/ InFlight (2)")
  riders           — integer (default 1 if not shown)
  pickup_location  — string or null  (location CODE where the ground vehicle physically picks up the passenger)
  pickup_from      — string or null  (the raw "From" cell text, copied verbatim from the PDF)
  pickup_time      — string or null  (the Pickup Date/Time column value, e.g. "01 Apr 05:55")
  dropoff_location — string or null  (location CODE where the ground vehicle physically drops off the passenger)
  dropoff_to       — string or null  (the raw "To" cell text, copied verbatim from the PDF)
  passenger_name   — string or null
  passenger_email  — string or null
  phone            — string or null
  flight_number    — string or null  (see Section 4 for exact extraction rules)

════════════════════════════════════════════════════════
SECTION 2 — PICKUP vs DROPOFF (READ THIS CAREFULLY)
════════════════════════════════════════════════════════
These schedules are GROUND TRANSPORTATION schedules, not airline schedules.
pickup_location and dropoff_location refer to where the VEHICLE picks up and drops off.

The "From" column tells you where the PASSENGER is coming from RIGHT NOW.
The "To" column tells you where the PASSENGER needs to GO.

Use this decision tree for every single row:

  IF the "From" cell contains a flight code (e.g. "AS 2270", "AS 2279", "QX 123"):
    → The passenger is ARRIVING by plane.
    → The vehicle goes to the AIRPORT to pick them up.
    → pickup_location  = the AIRPORT code for this schedule (e.g. "SEA", "PAE")
    → dropoff_location = the DESTINATION area code (hotel side, e.g. "PAE", "SEA")
    → pickup_from  = the "From" cell verbatim (contains the flight code + date/time)
    → dropoff_to   = the "To" cell verbatim (hotel name or base name)

  IF the "From" cell contains a hotel, base, or place name (e.g. "Delta Hotels Seattle Everett", "GT BASE"):
    → The passenger is DEPARTING and needs a ride TO the airport.
    → The vehicle goes to the HOTEL/BASE to pick them up.
    → pickup_location  = the HOTEL/BASE area code (e.g. "PAE")
    → dropoff_location = the AIRPORT code (e.g. "SEA", "PAE")
    → pickup_from  = the "From" cell verbatim (hotel or base name)
    → dropoff_to   = the "To" cell verbatim (flight code + date/time)

NEVER swap pickup and dropoff.
NEVER set pickup_location = dropoff_location unless the schedule explicitly shows same-location.
If you are unsure, look at whether "From" contains a flight code or a place name — that is always the deciding signal.

════════════════════════════════════════════════════════
SECTION 3 — DATE RULES
════════════════════════════════════════════════════════
- ride_date is MANDATORY for every row. Never output a row with ride_date = null.
- The year comes from the document title or header (visible in the DOCUMENT CONTEXT below).
- When a date cell is blank because of a rowspan (merged cell spanning multiple rows),
  carry down the most recent date seen above it. Do this silently — never leave it blank.
- If the page starts mid-table with no date visible, use the DOCUMENT CONTEXT to find
  the carry-down date from the end of the previous page.
- Format: YYYY-MM-DD always.

════════════════════════════════════════════════════════
SECTION 4 — FLIGHT NUMBER EXTRACTION
════════════════════════════════════════════════════════
Flight numbers appear inside pickup_from or dropoff_to as patterns like:
  "AS 2270-01 Apr 06:15"   → flight_number = "AS 2270"
  "AS 2279-01 Apr 21:50"   → flight_number = "AS 2279"
  "QX 1234-15 May 14:30"   → flight_number = "QX 1234"
  "ASA2270-01 Apr 06:15"   → flight_number = "AS 2270"

Rules:
1. Scan BOTH pickup_from AND dropoff_to for a flight pattern.
2. A flight pattern is: 2-3 uppercase letters (airline code) + optional space + digits.
3. Extract ONLY the airline code + number. Strip everything after: the dash, the date, the time.
   "AS 2270-01 Apr 06:15" → "AS 2270"  ✓
   "AS 2270-01 Apr 06:15" → "AS 2270-01 Apr 06:15"  ✗  (wrong — do not include date/time)
4. If a flight appears in dropoff_to (passenger departing), still extract it as flight_number.
5. If no flight pattern exists in either field, return null.
6. Never fabricate a flight number. If ambiguous, return null.

════════════════════════════════════════════════════════
SECTION 5 — ROW EXTRACTION RULES
════════════════════════════════════════════════════════
- Extract EVERY non-header data row from THIS PAGE. Do not skip any row.
- The output ride count must equal the number of data rows visible on this page.
- Skip ONLY: the column header row, and rows that are rendered entirely in BOLD
  (those are month/section dividers repeated from the previous month).
- Do NOT collapse rows that look similar — each row in the PDF = one ride object.
- Do NOT merge rows across date groups.
- Normalize all missing optional fields to null, not to empty strings "".
- Copy pickup_from and dropoff_to VERBATIM from the PDF — do not clean or shorten them.

════════════════════════════════════════════════════════
SECTION 6 — SELF-CHECK BEFORE OUTPUTTING
════════════════════════════════════════════════════════
Before you write your final JSON, mentally verify each ride:
  ✓ Does every ride have a non-null ride_date?
  ✓ Is pickup_location the place the VEHICLE goes to first?
  ✓ Is dropoff_location where the VEHICLE ends the trip?
  ✓ Does flight_number contain ONLY the airline code + number (no date, no time)?
  ✓ Is flight_number extracted from whichever field (pickup_from OR dropoff_to) had the flight?
  ✓ Are pickup_from and dropoff_to copied verbatim (not cleaned or shortened)?
  ✓ Is the ride count equal to the number of data rows on the page?

If any check fails, fix that ride before outputting.

════════════════════════════════════════════════════════
DOCUMENT CONTEXT (for year inference and date carry-down):
════════════════════════════════════════════════════════
${String(documentContext ?? "").slice(0, 4000)}

════════════════════════════════════════════════════════
PAGE TEXT TO EXTRACT (this page only):
════════════════════════════════════════════════════════
${String(pageText).slice(0, 12000)}`;

    console.log(
      `[parse-rides-pdf] Calling AI gateway, file: ${fileName}, page: ${pageNumber}/${totalPages}, text size: ${String(pageText).length} chars`,
    );

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error(`[parse-rides-pdf] AI gateway error ${aiRes.status}: ${t}`);
      if (aiRes.status === 429) {
        return json({ error: "Rate limit exceeded. Please wait a moment and try again." }, 429);
      }
      if (aiRes.status === 402) {
        return json({ error: "AI credits exhausted. Please add credits to your Lovable workspace." }, 402);
      }
      return json({ error: `AI error ${aiRes.status}: ${t}` }, 502);
    }
    const data = await aiRes.json();
    let content: string = data.choices?.[0]?.message?.content ?? "";
    // Strip code fences if present
    content = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: { rides: unknown[] };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("[parse-rides-pdf] JSON parse failed:", e, "raw:", content.slice(0, 500));
      return json({ error: "Failed to parse AI JSON", raw: content.slice(0, 500) }, 502);
    }

    console.log(`[parse-rides-pdf] Success: extracted ${parsed.rides?.length ?? 0} rides`);
    return json({ rides: parsed.rides ?? [] });
  } catch (err) {
    console.error("[parse-rides-pdf] Unhandled error:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
