import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Runs every minute via pg_cron. Scans rides for upcoming pickup times and
// inserts driver notifications at 1 day, 1 hour, and 5 min before pickup.
// Also fires off due manual ride_reminders.
export const Route = createFileRoute("/api/public/hooks/process-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const sb = createClient(url, key);
        const now = new Date();
        const summary = { driver_auto: 0, manual: 0 };

        // Look at rides in the next 25 hours that have a pickup_time
        const todayStr = now.toISOString().slice(0, 10);
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);

        const { data: rides } = await sb
          .from("rides")
          .select("id, user_id, ride_date, pickup_time, pickup_location, pickup_from, dropoff_location, dropoff_to, department, riders, passenger_name, flight_number, phone, notes, amount, driver_id, status, drivers:driver_id(name, email, phone), routes:route_id(name)")
          .in("ride_date", [todayStr, tomorrowStr])
          .neq("status", "cancelled");

        const { data: alreadyLogged } = await sb
          .from("driver_notification_log")
          .select("ride_id, kind");
        const loggedSet = new Set((alreadyLogged ?? []).map((l) => `${l.ride_id}|${l.kind}`));

        const windows = [
          { kind: "day", minutes: 24 * 60, slack: 30, label: "in about 1 day" },
          { kind: "hour", minutes: 60, slack: 5, label: "in about 1 hour" },
          { kind: "five_min", minutes: 5, slack: 2, label: "in 5 minutes" },
        ];

        for (const r of rides ?? []) {
          if (!r.pickup_time) continue;
          const pickupDt = new Date(`${r.ride_date}T${normalizeTime(r.pickup_time)}:00`);
          if (isNaN(pickupDt.getTime())) continue;
          const minsUntil = (pickupDt.getTime() - now.getTime()) / 60000;
          for (const w of windows) {
            if (loggedSet.has(`${r.id}|${w.kind}`)) continue;
            if (Math.abs(minsUntil - w.minutes) <= w.slack) {
              const driver = Array.isArray(r.drivers) ? r.drivers[0] : r.drivers;
              const route = Array.isArray(r.routes) ? r.routes[0] : r.routes;
              const driverName = driver?.name ?? "Driver";
              const title = `Ride pickup ${w.label} — ${r.pickup_time}`;
              const lines = [
                `Driver: ${driverName}`,
                `Date/time: ${r.ride_date} at ${r.pickup_time}`,
                r.passenger_name ? `Passenger: ${r.passenger_name}` : null,
                r.riders ? `Riders: ${r.riders}` : null,
                r.department ? `Dept: ${r.department}` : null,
                r.flight_number ? `Flight: ${r.flight_number}` : null,
                r.phone ? `Phone: ${r.phone}` : null,
                `Pickup: ${r.pickup_location ?? ""}${r.pickup_from ? ` (${r.pickup_from})` : ""}`,
                `Dropoff: ${r.dropoff_location ?? ""}${r.dropoff_to ? ` (${r.dropoff_to})` : ""}`,
                route?.name ? `Route: ${route.name}` : null,
                r.amount ? `Fare: $${Number(r.amount).toFixed(2)}` : null,
                r.notes ? `Notes: ${r.notes}` : null,
              ].filter(Boolean);
              const body = lines.join(" • ");
              await sb.from("notifications").insert({
                user_id: r.user_id,
                driver_id: r.driver_id,
                ride_id: r.id,
                kind: `auto_${w.kind}`,
                title,
                body,
              });
              await sb.from("driver_notification_log").insert({ ride_id: r.id, kind: w.kind });
              summary.driver_auto += 1;
            }
          }
        }

        // Manual reminders due
        const { data: due } = await sb
          .from("ride_reminders")
          .select("*")
          .lte("remind_at", now.toISOString())
          .eq("notified", false);

        for (const m of due ?? []) {
          await sb.from("notifications").insert({
            user_id: m.user_id,
            ride_id: m.ride_id,
            kind: "manual",
            title: m.message ?? "Ride reminder",
            body: `Reminder for ride ${m.ride_id}`,
          });
          await sb.from("ride_reminders").update({ notified: true }).eq("id", m.id);
          summary.manual += 1;
        }

        return new Response(JSON.stringify({ ok: true, ...summary }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

function normalizeTime(t: string): string {
  // accept "14:30", "14:30:00", "2:30 PM"
  const s = t.trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2];
    const isPm = ampm[3].toUpperCase() === "PM";
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}`;
  return "00:00";
}
