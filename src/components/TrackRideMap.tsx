import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function FollowDriver({ pos }: { pos: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(pos, { animate: true });
  }, [pos, map]);
  return null;
}

export default function TrackRideMap({
  pos,
  driverName,
  accuracy,
}: {
  pos: [number, number];
  driverName?: string;
  accuracy: number | null;
}) {
  return (
    <MapContainer center={pos} zoom={15} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={pos} icon={driverIcon}>
        <Popup>{driverName ?? "Driver"}</Popup>
      </Marker>
      {accuracy ? <Circle center={pos} radius={accuracy} pathOptions={{ color: "#10b981", weight: 1, fillOpacity: 0.08 }} /> : null}
      <FollowDriver pos={pos} />
    </MapContainer>
  );
}
