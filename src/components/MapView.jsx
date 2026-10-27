import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function MapView({ data }) {
  if (!data) return <p>Loading...</p>;
  const { kitchen, schools } = data;

  return (
    <MapContainer
      center={[kitchen.lat, kitchen.lng]}
      zoom={14}
      style={{ height: '100vh', width: '100%' }}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      <CircleMarker center={[kitchen.lat, kitchen.lng]} radius={10} pathOptions={{ color: 'red' }}>
        <Tooltip>{kitchen.name}</Tooltip>
      </CircleMarker>

      {schools.map(s => (
        <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={7} pathOptions={{ color: 'blue' }}>
          <Tooltip>{s.name} ({s.students} siswa)</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}