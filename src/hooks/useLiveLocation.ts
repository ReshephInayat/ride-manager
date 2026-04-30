import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Args {
  enabled: boolean;
  driverId: string;
  pin: string;
  rideId: string | null;
  onError?: (msg: string) => void;
}

// Streams the browser's GPS to driver_locations while enabled.
// Throttles to one RPC every 10s (or on >25m movement).
export function useLiveLocation({ enabled, driverId, pin, rideId, onError }: Args) {
  const [active, setActive] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const lastSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !rideId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onError?.("Geolocation is not supported on this device.");
      return;
    }

    let cancelled = false;

    const send = async (lat: number, lng: number, acc?: number, hdg?: number, spd?: number) => {
      const { error } = await supabase.rpc("driver_update_location", {
        _driver_id: driverId,
        _pin: pin,
        _ride_id: rideId,
        _lat: lat,
        _lng: lng,
        _accuracy: acc,
        _heading: hdg,
        _speed: spd,
      });
      if (error) {
        onError?.(error.message);
      } else if (!cancelled) {
        setLastSentAt(Date.now());
      }
    };

    const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const onPos = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      const now = Date.now();
      const last = lastSentRef.current;
      const moved = last ? distanceMeters(last, { lat: latitude, lng: longitude }) : Infinity;
      const elapsed = last ? now - last.at : Infinity;
      if (elapsed >= 10000 || moved >= 25) {
        lastSentRef.current = { at: now, lat: latitude, lng: longitude };
        void send(latitude, longitude, accuracy ?? undefined, heading ?? undefined, speed ?? undefined);
      }
    };

    const onErr = (err: GeolocationPositionError) => {
      onError?.(err.message || "Unable to read your location.");
    };

    setActive(true);
    watchRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });

    return () => {
      cancelled = true;
      setActive(false);
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      lastSentRef.current = null;
      void supabase.rpc("driver_clear_location", { _driver_id: driverId, _pin: pin });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, driverId, pin, rideId]);

  return { active, lastSentAt };
}
