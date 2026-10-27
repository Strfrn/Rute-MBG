import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/data/data.json')
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) return <p>Loading...</p>;
    const kitchenPos = [data.kitchen.lat, data.kitchen.lng];
  const routePoints = [
    kitchenPos,
    ...data.schools.map(s => [s.lat, s.lng]),
    kitchenPos,
  ];

  return (
    <MapContainer
      center={[data.kitchen.lat, data.kitchen.lng]}
      zoom={14}
      style={{ height: '100vh', width: '100%' }}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      <CircleMarker
        center={[data.kitchen.lat, data.kitchen.lng]}
        radius={10}
        pathOptions={{ color: 'red' }}
      >
        <Tooltip>{data.kitchen.name}</Tooltip>
      </CircleMarker>

      <Polyline positions={routePoints} pathOptions={{ color: 'green', weight: 4 }} />
      {data.schools.map(s => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={7}
          pathOptions={{ color: 'blue' }}
        >
          <Tooltip>{s.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}