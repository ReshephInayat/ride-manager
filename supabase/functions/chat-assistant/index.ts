// Chat assistant: answers questions using the user's rides/routes/drivers/invoices data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser(token);
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { messages, system } = await req.json();
    const sys = system === "llc" ? "llc" : "api";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const todayIso = new Date().toISOString().slice(0, 10);

    const [ridesRes, routesRes, driversRes, invoicesRes] = await Promise.all([
      admin.from("rides").select("id,ride_date,pickup_time,pickup_from,pickup_location,dropoff_to,dropoff_location,status,riders,amount,passenger_name,phone,flight_number,notes,driver_id,route_id,department")
        .eq("user_id", user.id).eq("system", sys).order("ride_date", { ascending: true }).order("pickup_time", { ascending: true }).limit(300),
      admin.from("routes").select("id,name,pickup_location,dropoff_location,price").eq("user_id", user.id).eq("system", sys),
      admin.from("drivers").select("id,name,phone,email,active").eq("user_id", user.id).eq("system", sys),
      admin.from("invoices").select("id,invoice_number,bill_to,period_start,period_end,subtotal,sales_tax_amount,total,created_at").eq("user_id", user.id).eq("system", sys).order("created_at", { ascending: false }).limit(50),
    ]);

    const rides = ridesRes.data ?? [];
    const routes = routesRes.data ?? [];
    const drivers = driversRes.data ?? [];
    const invoices = invoicesRes.data ?? [];

    const driverById = Object.fromEntries(drivers.map((d) => [d.id, d.name]));
    const routeById = Object.fromEntries(routes.map((r) => [r.id, r.name]));

    const upcoming = rides.filter((r) => r.ride_date >= todayIso && r.status === "pending").slice(0, 25);
    const recent = rides.filter((r) => r.ride_date < todayIso).slice(-25);
    const completedSum = rides.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.amount || 0), 0);

    const fmtRide = (r: any) =>
      `- ${r.ride_date} ${r.pickup_time ?? ""} | ${r.pickup_from ?? r.pickup_location ?? "?"} → ${r.dropoff_to ?? r.dropoff_location ?? "?"} | riders:${r.riders} | $${r.amount} | ${r.status}${r.passenger_name ? ` | pax:${r.passenger_name}` : ""}${r.phone ? ` ${r.phone}` : ""}${r.flight_number ? ` flight:${r.flight_number}` : ""}${r.driver_id ? ` | driver:${driverById[r.driver_id] ?? "?"}` : ""}${r.route_id ? ` | route:${routeById[r.route_id] ?? "?"}` : ""}`;

    const systemLabel = sys === "api" ? "Puget Sound Limo API" : "Puget Sound Limo LLC";
    const context = [
      `You are the in-app assistant for ${systemLabel}. Today is ${todayIso}.`,
      `Answer concisely from the user's data below. If asked "when is my next ride", use the first UPCOMING ride.`,
      sys === "api" ? `Commission rule: 10% of completed-ride totals. Total completed: $${completedSum.toFixed(2)}, commission: $${(completedSum * 0.1).toFixed(2)}, net: $${(completedSum * 0.9).toFixed(2)}.` : "",
      ``,
      `ROUTES (${routes.length}):`,
      ...routes.map((r) => `- ${r.name}: ${r.pickup_location} → ${r.dropoff_location} @ $${r.price}`),
      ``,
      `DRIVERS (${drivers.length}):`,
      ...drivers.map((d) => `- ${d.name}${d.phone ? ` (${d.phone})` : ""}${d.active ? "" : " [inactive]"}`),
      ``,
      `UPCOMING RIDES (${upcoming.length}):`,
      ...upcoming.map(fmtRide),
      ``,
      `RECENT PAST RIDES (${recent.length}):`,
      ...recent.map(fmtRide),
      ``,
      `INVOICES (${invoices.length}):`,
      ...invoices.slice(0, 15).map((i) => `- #${i.invoice_number} ${i.bill_to} ${i.period_start ?? ""}–${i.period_end ?? ""} total:$${i.total}`),
    ].filter(Boolean).join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: context },
          ...(messages ?? []),
        ],
      }),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limited, please wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("chat-assistant error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
