// Kecepatan rata-rata per jenis jalan (km/jam). Ini asumsi, boleh diubah.
const SPEED_KMH = {
  trunk: 35, trunk_link: 40,
  primary: 30, primary_link: 30,
  secondary: 25, secondary_link: 30,
  tertiary: 20, tertiary_link: 25,
  unclassified: 15, residential: 20,
  living_street: 10, service: 15,
};

// Jarak dua koordinat dalam meter
export function haversine(a, b) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Apakah jalan ini bisa dilewati kendaraan pengantar MBG?
function isDrivable(tags) {
  // Buang jalan yang dilarang untuk kendaraan
  const blocked = ['no', 'private'];
  if (blocked.includes(tags.access)) return false;
  if (blocked.includes(tags.motor_vehicle)) return false;
  if (blocked.includes(tags.motorcar)) return false;

  // Buang jalan yang bukan untuk lalu lintas umum
  if (tags.highway === 'living_street') return false;
  if (tags.highway === 'service') {
    const bad = ['driveway', 'parking_aisle', 'alley', 'drive-through'];
    if (bad.includes(tags.service)) return false;
  }

  // Kalau lebarnya dicatat dan terlalu sempit, buang
  if (tags.width) {
    const w = parseFloat(tags.width);
    if (!Number.isNaN(w) && w < 4) return false;
  }

  return true;
}

export function buildGraph(osm) {
  // 1. Catat koordinat semua titik
  const coords = new Map();
  for (const el of osm.elements) {
    if (el.type === 'node') coords.set(el.id, { lat: el.lat, lon: el.lon });
  }

  // 2. adj = daftar tetangga setiap titik
  const adj = new Map();
  const addEdge = (from, to, dist, time) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, dist, time });
  };

  // 3. Setiap jalan dipecah jadi ruas-ruas pendek antar dua titik
  for (const el of osm.elements) {
    if (el.type !== 'way') continue;
    const tags = el.tags || {};
     if (!isDrivable(tags)) continue;
    const speed = SPEED_KMH[tags.highway] || 20;
    const metersPerSec = (speed * 1000) / 3600;

    const oneWay =
      tags.oneway === 'yes' || tags.oneway === '1' ||
      tags.oneway === 'true' || tags.junction === 'roundabout';
    const reversed = tags.oneway === '-1';

    for (let i = 0; i < el.nodes.length - 1; i++) {
      const a = el.nodes[i];
      const b = el.nodes[i + 1];
      const ca = coords.get(a);
      const cb = coords.get(b);
      if (!ca || !cb) continue;

      const dist = haversine(ca, cb);
      const time = dist / metersPerSec;

      if (reversed) {
        addEdge(b, a, dist, time);
      } else {
        addEdge(a, b, dist, time);
        if (!oneWay) addEdge(b, a, dist, time);
      }
    }
  }

  return { coords, adj };
}