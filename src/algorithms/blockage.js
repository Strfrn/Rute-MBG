// Jarak (meter) dari pusat blokade p ke ruas jalan a-b
function distToSegment(p, a, b) {
  const kx = Math.cos((p.lat * Math.PI) / 180) * 111320; // meter per derajat lon
  const ky = 110540; // meter per derajat lat
  const ax = (a.lon - p.lng) * kx;
  const ay = (a.lat - p.lat) * ky;
  const bx = (b.lon - p.lng) * kx;
  const by = (b.lat - p.lat) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

// blockages = [{ lat, lng, radius }]  (radius dalam meter)
// Mengembalikan graph baru tanpa ruas jalan yang menyentuh lingkaran blokade.
// Graph asli tidak diubah.
export function applyBlockages(adj, coords, blockages) {
  if (!blockages.length) return adj;
  const out = new Map();
  for (const [from, list] of adj) {
    const a = coords.get(from);
    const kept = list.filter(e => {
      const b = coords.get(e.to);
      return !blockages.some(bl => distToSegment(bl, a, b) <= bl.radius);
    });
    out.set(from, kept);
  }
  return out;
}
