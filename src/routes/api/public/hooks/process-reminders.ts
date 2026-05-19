import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/process-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
        const cronSecret = process.env.CRON_SECRET;
        const providedApiKey =
          request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const providedCron = request.headers.get("x-cron-secret");
        const ok = (anonKey && providedApiKey === anonKey) || (cronSecret && providedCron === cronSecret);
        if (!ok) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const sb = createClient(url, key);

        const now = new Date();
        const summary = { driver_auto: 0, manual: 0 };

        const todayStr = now.toISOString().slice(0, 10);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);

        const { data: rides } = await sb
          .from("rides")
          .select(
            "id, user_id, system, ride_date, pickup_time, pickup_location, pickup_from, dropoff_location, dropoff_to, department, riders, passenger_name, flight_number, phone, notes, amount, driver_id, status, drivers:driver_id(name, email, phone), routes:route_id(name)",
          )
          .in("ride_date", [todayStr, tomorrowStr])
          .neq("status", "cancelled");

        const { data: alreadyLogged } = await sb.from("driver_notification_log").select("ride_id, kind");

        const loggedSet = new Set((alreadyLogged ?? []).map((l) => `${l.ride_id}|${l.kind}`));

        // ONLY 1-HOUR REMINDER
        const windows = [{ kind: "hour", minutes: 60, slack: 5, label: "1h reminder" }];

        // SMS BUILDER (SHORT + SAFE)
        function buildReminderSms(r: any, driverName: string, label: string) {
          const pickup = `${r.pickup_location ?? ""}${r.pickup_from ? ` (${r.pickup_from})` : ""}`;

          const dropoff = `${r.dropoff_location ?? ""}${r.dropoff_to ? ` (${r.dropoff_to})` : ""}`;

          const time = `${r.ride_date} ${r.pickup_time ?? ""}`;

          return [
            `REMINDER: ${label}`,
            `Ride: ${r.flight_number ?? r.id}`,
            `Driver: ${driverName}`,
            `Pickup: ${pickup}`,
            `Dropoff: ${dropoff}`,
            `Time: ${time}`,
          ]
            .filter(Boolean)
            .join(" | ")
            .replace(/•/g, "|")
            .replace(/—/g, "-");
        }

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

              const title = `Ride ${w.label} — ${r.pickup_time}`;

              // ADMIN NOTIFICATION BODY (FULL)
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

              const body = lines.join(" | ");

              // SAVE NOTIFICATION
              await sb.from("notifications").insert({
                user_id: r.user_id,
                system: r.system ?? "api",
                driver_id: r.driver_id,
                ride_id: r.id,
                kind: `auto_${w.kind}`,
                title,
                body,
              });

              await sb.from("driver_notification_log").insert({ ride_id: r.id, kind: w.kind });

              summary.driver_auto += 1;

              // SMS FOR 1-HOUR REMINDER (removed the condition)
              if (driver?.phone) {
                try {
                  const smsBody = buildReminderSms(r, driverName, w.label);
                  await sendSms(driver.phone, smsBody);
                } catch (e) {
                  console.error("Twilio SMS failed", e);
                }
              }
            }
          }
        }

        // MANUAL REMINDERS (keep as is)
        const { data: due } = await sb
          .from("ride_reminders")
          .select("*")
          .lte("remind_at", now.toISOString())
          .eq("notified", false);

        for (const m of due ?? []) {
          await sb.from("notifications").insert({
            user_id: m.user_id,
            system: m.system ?? "api",
            ride_id: m.ride_id,
            kind: "manual",
            title: m.message ?? "Ride reminder",
            body: `Reminder for ride ${m.ride_id}`,
          });

          await sb.from("ride_reminders").update({ notified: true }).eq("id", m.id);

          summary.manual += 1;
        }

        // NOTE REMINDERS (keep as is)
        let noteSms = 0;
        const { data: dueNotes } = await sb
          .from("notes")
          .select("id, title, body, driver_id, system, drivers:driver_id(name, phone)")
          .eq("is_reminder", true)
          .eq("sms_sent", false)
          .lte("remind_at", now.toISOString());

        for (const note of (dueNotes ?? []) as any[]) {
          const drv = Array.isArray(note.drivers) ? note.drivers[0] : note.drivers;
          if (drv?.phone) {
            try {
              const msg = `REMINDER: ${note.title}${note.body ? ` | ${String(note.body).slice(0, 200)}` : ""}`
                .replace(/•/g, "|")
                .replace(/—/g, "-");
              await sendSms(drv.phone, msg);
              noteSms += 1;
            } catch (e) {
              console.error("Note SMS failed", e);
            }
          }
          await sb.from("notes").update({ sms_sent: true, sms_sent_at: new Date().toISOString() }).eq("id", note.id);
        }

        return new Response(JSON.stringify({ ok: true, ...summary, note_sms: noteSms }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

// Keep all helper functions the same (normalizeTime, sendSms)
