// Aviationstack flight lookup - public cached proxy
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const cache = new Map<string, { ts: number; data: any }>();
const TTL = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const flight = (url.searchParams.get("flight") ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const date = url.searchParams.get("date") ?? undefined;
    if (!flight) return new Response(JSON.stringify({ error: "missing flight param" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const key = `${flight}|${date ?? ""}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < TTL) {
      return new Response(JSON.stringify({ cached: true, ...hit.data }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const apiKey = Deno.env.get("AVIATIONSTACK_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "AVIATIONSTACK_API_KEY not configured" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });

    const params = new URLSearchParams({ access_key: apiKey, flight_iata: flight, limit: "5" });
    if (date) params.set("flight_date", date);

    // Aviationstack free plan only supports HTTP (HTTPS returns 403).
    const resp = await fetch(`http://api.aviationstack.com/v1/flights?${params.toString()}`);
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `Aviationstack ${resp.status}`, body: t }), { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    const json = await resp.json();
    const payload = { flight, date, data: json.data ?? [], pagination: json.pagination ?? null };
    cache.set(key, { ts: Date.now(), data: payload });
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
