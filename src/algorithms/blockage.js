const KY = 110540; // meter per derajat lintang
const kxAt = lat => Math.cos((lat * Math.PI) / 180) * 111320; // meter per derajat bujur

// Cari ruas jalan terdekat dari titik klik, lalu buat "palang" yang melintang di jalan itu.
// Mengembalikan null kalau tidak ada jalan dalam jarak maxDist (meter).
export function makeBlockage(adj, coords, ll, maxDist = 30, halfWidth = 8) {
  const kx = kxAt(ll.lat);
  let best = null;

  for (const [from, list] of adj) {
    const A = coords.get(from);
    const ax = (A.lon - ll.lng) * kx;
    const ay = (A.lat - ll.lat) * KY;
    for (const e of list) {
      const B = coords.get(e.to);
      const dx = (B.lon - A.lon) * kx;
      const dy = (B.lat - A.lat) * KY;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (!best || d < best.d) best = { d, a: from, b: e.to, A, B, t, dx, dy, len2 };
    }
  }
  if (!best || best.d > maxDist) return null;

  // Titik di jalan yang paling dekat dengan klik
  const lat = best.A.lat + best.t * (best.B.lat - best.A.lat);
  const lon = best.A.lon + best.t * (best.B.lon - best.A.lon);

  // Arah jalan diputar 90 derajat supaya palang melintang di jalan
  const len = Math.sqrt(best.len2);
  const px = len ? -best.dy / len : 1; // komponen timur
  const py = len ? best.dx / len : 0; // komponen utara
  const kxs = kxAt(lat);
  const end = sign => [lat + (sign * py * halfWidth) / KY, lon + (sign * px * halfWidth) / kxs];

  return { a: best.a, b: best.b, lat, lng: lon, ends: [end(1), end(-1)] };
}

// Graph baru tanpa ruas jalan yang ditutup palang (dua arah). Graph asli tidak diubah.
export function applyBlockages(adj, coords, blockages) {
  if (!blockages.length) return adj;
  const closed = new Set();
  for (const b of blockages) {
    closed.add(b.a + '>' + b.b);
    closed.add(b.b + '>' + b.a);
  }
  const out = new Map();
  for (const [from, list] of adj) {
    out.set(from, list.filter(e => !closed.has(from + '>' + e.to)));
  }
  return out;
}
