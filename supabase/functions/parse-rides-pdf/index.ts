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

    const prompt = `You are a strict data extractor. The input text is from page ${pageNumber ?? "?"} of ${totalPages ?? "?"} in a Horizon Air Ground Transportation Schedule named "${fileName ?? "schedule.pdf"}".
Extract EVERY non-header data row from THIS PAGE TEXT — do not skip any row. The output count must equal the number of data rows in this page text.

For each row return JSON with fields:
- ride_date (YYYY-MM-DD; use the year shown in the document title). MANDATORY for every row.
- department (e.g. "Flight (2)/ InFlight (2)")
- riders (integer)
- pickup_location (e.g. "PAE", "SEA")
- pickup_from (the "From" column, e.g. "Delta Hotels Seattle Everett" or "GT BASE-01 Apr 15:05" or "AS 2279-01 Apr 21:50")
- pickup_time (the Pickup Date/Time column, e.g. "01 Apr 05:55")
- dropoff_location (e.g. "PAE", "SEA")
- dropoff_to (the "To" column, e.g. "AS 2270-01 Apr 06:15" or "Delta Hotels Seattle Everett")
- passenger_name, passenger_email, phone if present in the row/document; otherwise null
- flight_number if present in pickup_from or dropoff_to (e.g. "AS 2270" or "ASA2270"); otherwise null

CRITICAL rules:
- DATE CARRY-DOWN: when a row's DATE cell is blank because of rowspan, copy the date from the most recent row above that had a date. Use the document context only to infer the schedule year and carry-down date at the top of this page when needed. Never output a row with a missing ride_date.
- Skip ONLY the table header row and rows rendered in BOLD (those are repeated from the previous month).
- Do not collapse rows that look similar — output every distinct row.
- Normalize missing optional values as null, not empty strings.
- Return ONLY valid JSON: {"rides":[ ... ]}. No prose, no code fences.

DOCUMENT CONTEXT:
${String(documentContext ?? "").slice(0, 4000)}

PAGE TEXT TO EXTRACT:
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
        return json(
          { error: "AI credits exhausted. Please add credits to your Lovable workspace." },
          402,
        );
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
