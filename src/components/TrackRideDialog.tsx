import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Ride } from "@/lib/rides";
import { Loader2 } from "lucide-react";

interface DriverLocation {
  driver_id: string;
  ride_id: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: string;
}

function formatAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

// Lazy-load leaflet map only on the client side
const LeafletMap = lazy(() => import("./TrackRideMap"));

export function TrackRideDialog({
  ride,
  open,
  onOpenChange,
  driverName,
}: {
  ride: Ride;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  driverName?: string;
}) {
  const [loc, setLoc] = useState<DriverLocation | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open || !ride.driver_id) return;
    const fetchOne = async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("driver_id, ride_id, lat, lng, accuracy, updated_at")
        .eq("driver_id", ride.driver_id!)
        .maybeSingle();
      if (data) setLoc(data as DriverLocation);
    };
    void fetchOne();

    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase
        .channel(`track-${ride.driver_id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "driver_locations", filter: `driver_id=eq.${ride.driver_id}` },
          (payload) => {
            if (payload.eventType === "DELETE") setLoc(null);
            else setLoc(payload.new as DriverLocation);
          },
        )
        .subscribe();
    } catch (e) {
      console.warn("Realtime subscription failed:", e);
    }

    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      if (ch) supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [open, ride.driver_id]);

  const pos = useMemo<[number, number] | null>(
    () => (loc ? [loc.lat, loc.lng] : null),
    [loc],
  );
  const fresh = loc ? Date.now() - new Date(loc.updated_at).getTime() < 60_000 : false;
  void tick;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${fresh ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
            Live tracking — {driverName ?? "Driver"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {loc
              ? `Last update ${formatAgo(loc.updated_at)}${loc.accuracy ? ` • ±${Math.round(loc.accuracy)}m` : ""}`
              : "Waiting for the driver to start sharing location…"}
          </div>
          <div className="h-[420px] w-full rounded-lg overflow-hidden border">
            {pos ? (
              <Suspense fallback={<div className="h-full grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <LeafletMap pos={pos} driverName={driverName} accuracy={loc?.accuracy ?? null} />
              </Suspense>
            ) : (
              <div className="h-full grid place-items-center text-muted-foreground text-sm">
                The driver is not sharing location yet. They share automatically once they mark the ride as "Arrived".
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div><span className="font-medium text-foreground">Pickup:</span> {ride.pickup_location ?? "—"}{ride.pickup_from ? ` (${ride.pickup_from})` : ""}</div>
            <div><span className="font-medium text-foreground">Dropoff:</span> {ride.dropoff_location ?? "—"}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
