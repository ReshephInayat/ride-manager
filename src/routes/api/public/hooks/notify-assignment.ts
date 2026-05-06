import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/notify-assignment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify cron secret to prevent unauthenticated access
        const cronSecret = process.env.CRON_SECRET;
        const providedSecret = request.headers.get("x-cron-secret");
        if (!cronSecret || providedSecret !== cronSecret) {
          return jsonError("unauthorized", 401);
        }

        let payload: { ride_id?: string } = {};

        try {
          payload = (await request.json()) as { ride_id?: string };
        } catch {
          return jsonError("invalid_json", 400);
        }

        const rideId = payload.ride_id;
        if (!rideId || typeof rideId !== "string") {
          return jsonError("missing_ride_id", 400);
        }

        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return jsonError("server_misconfigured", 500);

        const sb = createClient(url, key);

        const { data: ride, error } = await sb
          .from("rides")
          .select(
            "id, user_id, system, ride_date, pickup_time, pickup_location, pickup_from, dropoff_location, dropoff_to, department, riders, passenger_name, flight_number, phone, notes, amount, driver_id, drivers:driver_id(name, phone, email)",
          )
          .eq("id", rideId)
          .maybeSingle();

        if (error) return jsonError(error.message, 500);
        if (!ride) return jsonError("ride_not_found", 404);
        if (!ride.driver_id) return jsonError("ride_has_no_driver", 400);

        const driver = Array.isArray(ride.drivers) ? ride.drivers[0] : ride.drivers;

        const driverName = driver?.name ?? "Driver";

        // -------------------------------
        // FULL ADMIN NOTIFICATION BODY
        // -------------------------------
        const fullBodyLines = [
          `Driver: ${driverName}`,
          `Date/time: ${ride.ride_date}${ride.pickup_time ? ` at ${ride.pickup_time}` : ""}`,
          ride.passenger_name ? `Passenger: ${ride.passenger_name}` : null,
          ride.riders ? `Riders: ${ride.riders}` : null,
          ride.department ? `Dept: ${ride.department}` : null,
          ride.flight_number ? `Flight: ${ride.flight_number}` : null,
          ride.phone ? `Phone: ${ride.phone}` : null,
          `Pickup: ${ride.pickup_location ?? ""}${ride.pickup_from ? ` (${ride.pickup_from})` : ""}`,
          `Dropoff: ${ride.dropoff_location ?? ""}${ride.dropoff_to ? ` (${ride.dropoff_to})` : ""}`,
          ride.notes ? `Notes: ${ride.notes}` : null,
        ].filter(Boolean);

        const adminBody = fullBodyLines.join(" | ");

        // -------------------------------
        // IN-APP NOTIFICATION
        // -------------------------------
        await sb.from("notifications").insert({
          user_id: ride.user_id,
          system: ride.system ?? "api",
          driver_id: ride.driver_id,
          ride_id: ride.id,
          kind: "assignment",
          title: `Assigned to ${driverName}`,
          body: adminBody,
        });

        // -------------------------------
        // OPTIMIZED SMS BUILDER
        // -------------------------------
        function buildSms(ride: any, driverName: string) {
          const pickup = `${ride.pickup_location ?? ""}${ride.pickup_from ? ` (${ride.pickup_from})` : ""}`;

          const dropoff = `${ride.dropoff_location ?? ""}${ride.dropoff_to ? ` (${ride.dropoff_to})` : ""}`;

          const time = `${ride.ride_date}${ride.pickup_time ? ` ${ride.pickup_time}` : ""}`;

          return [
            `Ride: ${ride.flight_number ?? ride.id}`,
            `Driver: ${driverName}`,
            `Pickup: ${pickup}`,
            `Dropoff: ${dropoff}`,
            `Pax: ${ride.riders ?? "-"}`,
            `Time: ${time}`,
          ]
            .filter(Boolean)
            .join(" | ")
            .replace(/•/g, "|")
            .replace(/—/g, "-");
        }

        // -------------------------------
        // SMS SENDING
        // -------------------------------
        let sms: { sent: boolean; reason?: string } = {
          sent: false,
          reason: "no_phone",
        };

        if (driver?.phone) {
          try {
            const smsBody = buildSms(ride, driverName);

            await sendSms(driver.phone, smsBody);

            sms = { sent: true };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("Twilio SMS failed", msg);
            sms = { sent: false, reason: msg };
          }
        }

        return new Response(JSON.stringify({ ok: true, sms }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

// -------------------------------
// ERROR HELPER
// -------------------------------
function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// -------------------------------
// TWILIO SENDER
// -------------------------------
async function sendSms(to: string, body: string): Promise<void> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  if (!twilioKey) throw new Error("TWILIO_API_KEY not configured");
  if (!from) throw new Error("TWILIO_FROM_NUMBER not configured");

  const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: from,
      Body: body,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twilio ${res.status}: ${txt}`);
  }
}
