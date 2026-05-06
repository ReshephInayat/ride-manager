// Chat assistant: answers questions AND performs admin actions using the user's rides/routes/drivers/invoices data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = [
  "https://pugetsoundlimo-ridemanager.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const adminTools = [
  {
    type: "function" as const,
    function: {
      name: "update_ride_status",
      description: "Update the status of a ride. Use when admin asks to change a ride's status.",
      parameters: {
        type: "object",
        properties: {
          ride_id: { type: "string", description: "UUID of the ride to update" },
          status: { type: "string", enum: ["pending", "started", "arrived", "completed", "cancelled", "no_show"], description: "New status" },
        },
        required: ["ride_id", "status"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "assign_driver",
      description: "Assign a driver to a ride by driver name or ID.",
      parameters: {
        type: "object",
        properties: {
          ride_id: { type: "string", description: "UUID of the ride" },
          driver_name: { type: "string", description: "Name of the driver to assign (will be matched from available drivers)" },
        },
        required: ["ride_id", "driver_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_ride",
      description: "Create a new ride. Use when admin asks to add a ride.",
      parameters: {
        type: "object",
        properties: {
          ride_date: { type: "string", description: "Date in YYYY-MM-DD format" },
          pickup_time: { type: "string", description: "Pickup time e.g. '08:00' or '08:00 AM'" },
          pickup_location: { type: "string", description: "Pickup location code or name" },
          pickup_from: { type: "string", description: "Detailed pickup origin" },
          dropoff_location: { type: "string", description: "Dropoff location code or name" },
          dropoff_to: { type: "string", description: "Detailed dropoff destination" },
          riders: { type: "number", description: "Number of riders, defaults to 1" },
          passenger_name: { type: "string", description: "Passenger name if provided" },
          phone: { type: "string", description: "Passenger phone if provided" },
          flight_number: { type: "string", description: "Flight number if provided" },
          notes: { type: "string", description: "Any notes" },
        },
        required: ["ride_date", "pickup_location", "dropoff_location"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_route",
      description: "Create a new route with pricing.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Route name e.g. 'Hotel ↔ SEA'" },
          pickup_location: { type: "string", description: "Pickup location" },
          dropoff_location: { type: "string", description: "Dropoff location" },
          price: { type: "number", description: "Price for this route" },
        },
        required: ["name", "pickup_location", "dropoff_location", "price"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_driver",
      description: "Add a new driver.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Driver's full name" },
          phone: { type: "string", description: "Phone number" },
          email: { type: "string", description: "Email address" },
          login_pin: { type: "string", description: "Login PIN for the driver portal (min 4 digits). Will be securely hashed." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_ride",
      description: "Delete a ride by its ID.",
      parameters: {
        type: "object",
        properties: {
          ride_id: { type: "string", description: "UUID of the ride to delete" },
        },
        required: ["ride_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_ride",
      description: "Update ride details like date, time, locations, notes, amount, etc.",
      parameters: {
        type: "object",
        properties: {
          ride_id: { type: "string", description: "UUID of the ride" },
          ride_date: { type: "string", description: "New date YYYY-MM-DD" },
          pickup_time: { type: "string", description: "New pickup time" },
          pickup_location: { type: "string", description: "New pickup location" },
          pickup_from: { type: "string", description: "New pickup from" },
          dropoff_location: { type: "string", description: "New dropoff location" },
          dropoff_to: { type: "string", description: "New dropoff to" },
          riders: { type: "number", description: "Number of riders" },
          amount: { type: "number", description: "Ride amount/price" },
          notes: { type: "string", description: "Notes" },
          passenger_name: { type: "string", description: "Passenger name" },
          phone: { type: "string", description: "Phone" },
          flight_number: { type: "string", description: "Flight number" },
        },
        required: ["ride_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_driver",
      description: "Deactivate a driver (set active=false).",
      parameters: {
        type: "object",
        properties: {
          driver_name: { type: "string", description: "Name of driver to deactivate" },
        },
        required: ["driver_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_route",
      description: "Delete a route by name or ID.",
      parameters: {
        type: "object",
        properties: {
          route_name: { type: "string", description: "Name of route to delete" },
        },
        required: ["route_name"],
      },
    },
  },
];

async function executeToolCall(
  fnName: string,
  args: Record<string, unknown>,
  userId: string,
  system: string,
  admin: ReturnType<typeof createClient>,
  drivers: Array<{ id: string; name: string }>,
  routes: Array<{ id: string; name: string }>,
): Promise<string> {
  try {
    switch (fnName) {
      case "update_ride_status": {
        const { error } = await admin
          .from("rides")
          .update({ status: args.status, updated_at: new Date().toISOString() })
          .eq("id", args.ride_id)
          .eq("user_id", userId);
        if (error) return `Error: ${error.message}`;
        return `✅ Ride status updated to "${args.status}".`;
      }

      case "assign_driver": {
        const dName = String(args.driver_name).toLowerCase();
        const drv = drivers.find((d) => d.name.toLowerCase().includes(dName));
        if (!drv) return `Error: No driver found matching "${args.driver_name}". Available: ${drivers.map((d) => d.name).join(", ")}`;
        const { error } = await admin
          .from("rides")
          .update({ driver_id: drv.id, updated_at: new Date().toISOString() })
          .eq("id", args.ride_id)
          .eq("user_id", userId);
        if (error) return `Error: ${error.message}`;
        return `✅ Driver "${drv.name}" assigned to ride.`;
      }

      case "create_ride": {
        const row: Record<string, unknown> = {
          user_id: userId,
          system,
          ride_date: args.ride_date,
          pickup_time: args.pickup_time ?? null,
          pickup_location: args.pickup_location ?? null,
          pickup_from: args.pickup_from ?? null,
          dropoff_location: args.dropoff_location ?? null,
          dropoff_to: args.dropoff_to ?? null,
          riders: args.riders ?? 1,
          passenger_name: args.passenger_name ?? null,
          phone: args.phone ?? null,
          flight_number: args.flight_number ?? null,
          notes: args.notes ?? null,
          status: "pending",
          amount: 0,
          ride_key: `manual-${Date.now()}`,
        };
        // Try to auto-match a route for pricing
        const pickHay = `${row.pickup_from ?? ""} ${row.pickup_location ?? ""}`.toString().toLowerCase();
        const dropHay = `${row.dropoff_to ?? ""} ${row.dropoff_location ?? ""}`.toString().toLowerCase();
        const { data: allRoutes } = await admin.from("routes").select("id,name,pickup_location,dropoff_location,price").eq("user_id", userId).eq("system", system);
        if (allRoutes) {
          for (const r of allRoutes) {
            const p = r.pickup_location.toLowerCase();
            const d = r.dropoff_location.toLowerCase();
            if ((pickHay.includes(p) && dropHay.includes(d)) || (pickHay.includes(d) && dropHay.includes(p))) {
              row.route_id = r.id;
              row.amount = r.price;
              break;
            }
          }
        }
        const { data, error } = await admin.from("rides").insert(row).select("id").single();
        if (error) return `Error: ${error.message}`;
        return `✅ Ride created (ID: ${data.id}) for ${args.ride_date}. ${row.route_id ? `Auto-matched route, amount: $${row.amount}.` : "No route matched — amount set to $0."}`;
      }

      case "create_route": {
        const { data, error } = await admin
          .from("routes")
          .insert({
            user_id: userId,
            system,
            name: args.name,
            pickup_location: args.pickup_location,
            dropoff_location: args.dropoff_location,
            price: args.price ?? 0,
          })
          .select("id")
          .single();
        if (error) return `Error: ${error.message}`;
        return `✅ Route "${args.name}" created (ID: ${data.id}), price: $${args.price}.`;
      }

      case "create_driver": {
        const row: Record<string, unknown> = {
          user_id: userId,
          system,
          name: args.name,
          phone: args.phone ?? null,
          email: args.email ?? null,
        };
        // Hash PIN if provided instead of storing plaintext
        if (args.login_pin && typeof args.login_pin === "string" && args.login_pin.length >= 4) {
          const encoder = new TextEncoder();
          const data = encoder.encode(String(args.login_pin));
          const hashBuffer = await crypto.subtle.digest("SHA-256", data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          row.pin_hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        }
        const { data, error } = await admin.from("drivers").insert(row).select("id").single();
        if (error) return `Error: ${error.message}`;
        return `✅ Driver "${args.name}" added (ID: ${data.id}).${args.login_pin ? ` Login PIN set (securely hashed).` : ""}`;
      }

      case "delete_ride": {
        const { error } = await admin.from("rides").delete().eq("id", args.ride_id).eq("user_id", userId);
        if (error) return `Error: ${error.message}`;
        return `✅ Ride deleted.`;
      }

      case "update_ride": {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of ["ride_date", "pickup_time", "pickup_location", "pickup_from", "dropoff_location", "dropoff_to", "riders", "amount", "notes", "passenger_name", "phone", "flight_number"]) {
          if (args[key] !== undefined) updates[key] = args[key];
        }
        const { error } = await admin.from("rides").update(updates).eq("id", args.ride_id).eq("user_id", userId);
        if (error) return `Error: ${error.message}`;
        return `✅ Ride updated with: ${Object.keys(updates).filter((k) => k !== "updated_at").join(", ")}.`;
      }

      case "delete_driver": {
        const dName = String(args.driver_name).toLowerCase();
        const drv = drivers.find((d) => d.name.toLowerCase().includes(dName));
        if (!drv) return `Error: No driver found matching "${args.driver_name}".`;
        const { error } = await admin.from("drivers").update({ active: false }).eq("id", drv.id).eq("user_id", userId);
        if (error) return `Error: ${error.message}`;
        return `✅ Driver "${drv.name}" deactivated.`;
      }

      case "delete_route": {
        const rName = String(args.route_name).toLowerCase();
        const rt = routes.find((r) => r.name.toLowerCase().includes(rName));
        if (!rt) return `Error: No route found matching "${args.route_name}".`;
        const { error } = await admin.from("routes").delete().eq("id", rt.id).eq("user_id", userId);
        if (error) return `Error: ${error.message}`;
        return `✅ Route "${rt.name}" deleted.`;
      }

      default:
        return `Unknown action: ${fnName}`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

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
    if (!user) return json({ error: "Unauthorized" }, 401);

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
      `- [${r.id}] ${r.ride_date} ${r.pickup_time ?? ""} | ${r.pickup_from ?? r.pickup_location ?? "?"} → ${r.dropoff_to ?? r.dropoff_location ?? "?"} | riders:${r.riders} | $${r.amount} | ${r.status}${r.passenger_name ? ` | pax:${r.passenger_name}` : ""}${r.phone ? ` ${r.phone}` : ""}${r.flight_number ? ` flight:${r.flight_number}` : ""}${r.driver_id ? ` | driver:${driverById[r.driver_id] ?? "?"}` : ""}${r.route_id ? ` | route:${routeById[r.route_id] ?? "?"}` : ""}`;

    const systemLabel = sys === "api" ? "Puget Sound Limo API" : "Puget Sound Limo LLC";
    const context = [
      `You are the in-app AI assistant for ${systemLabel}. Today is ${todayIso}.`,
      `You can ANSWER questions AND PERFORM actions on behalf of the admin. You have tools to: update ride status, assign drivers, create/edit/delete rides, create/delete routes, create/deactivate drivers.`,
      `When the admin asks you to do something (e.g. "change ride status", "add a new ride", "assign driver X"), use the appropriate tool. Always confirm the action result.`,
      `When referencing rides, use the ride ID shown in brackets [id] in the data below.`,
      `If the user's request is ambiguous (e.g. "change that ride"), ask for clarification.`,
      sys === "api" ? `Commission rule: 10% of completed-ride totals. Total completed: $${completedSum.toFixed(2)}, commission: $${(completedSum * 0.1).toFixed(2)}, net: $${(completedSum * 0.9).toFixed(2)}.` : "",
      ``,
      `ROUTES (${routes.length}):`,
      ...routes.map((r) => `- [${r.id}] ${r.name}: ${r.pickup_location} → ${r.dropoff_location} @ $${r.price}`),
      ``,
      `DRIVERS (${drivers.length}):`,
      ...drivers.map((d) => `- [${d.id}] ${d.name}${d.phone ? ` (${d.phone})` : ""}${d.active ? "" : " [inactive]"}`),
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

    // First AI call with tools
    let aiMessages = [
      { role: "system", content: context },
      ...(messages ?? []),
    ];

    const MAX_TOOL_ROUNDS = 5;
    let finalReply = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools: adminTools,
        }),
      });

      if (resp.status === 429) return json({ error: "Rate limited, please wait a moment." }, 429);
      if (resp.status === 402) return json({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }, 402);
      if (!resp.ok) {
        const t = await resp.text();
        console.error("AI error", resp.status, t);
        return json({ error: "AI gateway error" }, 500);
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (!msg) {
        finalReply = "(no response)";
        break;
      }

      // If the model wants to call tools
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Add assistant message with tool calls
        aiMessages.push(msg);

        // Execute each tool call
        for (const tc of msg.tool_calls) {
          const fnName = tc.function.name;
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(tc.function.arguments);
          } catch {
            fnArgs = {};
          }

          console.log(`[chat-assistant] Tool call: ${fnName}`, fnArgs);

          const result = await executeToolCall(
            fnName,
            fnArgs,
            user.id,
            sys,
            admin,
            drivers.filter((d) => d.active),
            routes,
          );

          console.log(`[chat-assistant] Tool result: ${result}`);

          // Add tool result
          aiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          } as any);
        }
        // Continue loop to let model generate final response
        continue;
      }

      // No tool calls — this is the final text response
      finalReply = msg.content ?? "";
      break;
    }

    return json({ reply: finalReply || "(no response)" });
  } catch (e) {
    console.error("chat-assistant error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
