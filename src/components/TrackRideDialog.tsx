import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Ride } from "@/lib/rides";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default Leaflet marker icons via CDN (avoid bundler asset path issues).
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

const driverIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#10b981;border:3px solid white;box-shadow:0 0 0 3px rgba(16,185,129,0.4);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

interface DriverLocation {
  driver_id: string;
  ride_id: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: string;
}

function FollowDriver({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.panTo(pos, { animate: true });
  }, [pos, map]);
  return null;
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

    const ch = supabase
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

    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [open, ride.driver_id]);

  const pos = useMemo<[number, number] | null>(
    () => (loc ? [loc.lat, loc.lng] : null),
    [loc],
  );
  const fresh = loc ? Date.now() - new Date(loc.updated_at).getTime() < 60_000 : false;
  // tick is referenced so the "ago" label re-renders each second.
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
              <MapContainer center={pos} zoom={15} style={{ height: "100%", width: "100%" }}>
                <TileLayer
                  attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={pos} icon={driverIcon}>
                  <Popup>{driverName ?? "Driver"}</Popup>
                </Marker>
                {loc?.accuracy ? <Circle center={pos} radius={loc.accuracy} pathOptions={{ color: "#10b981", weight: 1, fillOpacity: 0.08 }} /> : null}
                <FollowDriver pos={pos} />
              </MapContainer>
            ) : (
              <div className="h-full grid place-items-center text-muted-foreground text-sm">
                The driver is not sharing location yet. They share automatically once they mark the ride as “Arrived”.
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
