import { haversine } from './graph.js';
import { MinHeap, buildPath } from './dijkstra.js';

// Kecepatan tertinggi di graph (meter/detik). Dipakai untuk perkiraan waktu.
export function maxSpeed(adj) {
  let m = 0;
  for (const list of adj.values()) {
    for (const e of list) {
      if (e.time > 0) {
        const v = e.dist / e.time;
        if (v > m) m = v;
      }
    }
  }
  return m || 1;
}

// A*: sama seperti Dijkstra, tapi simpul diurutkan berdasarkan
//   biaya sejauh ini + w * perkiraan biaya ke tujuan
// Perkiraan (heuristik) = jarak lurus ke tujuan (untuk waktu: dibagi kecepatan tertinggi).
// w = 1  -> jalur dijamin optimal.
// w > 1  -> lebih sedikit simpul dikunjungi, tapi jalur bisa lebih panjang dari optimal.
// record = true mencatat urutan simpul dan induknya (untuk visualisasi).
export function astar(adj, coords, start, target, weightKey, w = 1, vmax = 1, record = false) {
  const goal = coords.get(target);
  const h = id => {
    const d = haversine(coords.get(id), goal);
    return weightKey === 'dist' ? d : d / vmax;
  };

  const cost = new Map([[start, 0]]);
  const prev = new Map();
  const done = new Set();
  const order = [];
  const parent = [];
  let visited = 0;
  const heap = new MinHeap();
  heap.push([w * h(start), start]);

  while (heap.size) {
    const [, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    visited++;
    if (record) {
      order.push(u);
      parent.push(prev.has(u) ? prev.get(u) : null);
    }
    if (u === target) break;

    const cu = cost.get(u);
    for (const e of adj.get(u) || []) {
      const nc = cu + e[weightKey];
      if (nc < (cost.get(e.to) ?? Infinity)) {
        cost.set(e.to, nc);
        prev.set(e.to, u);
        heap.push([nc + w * h(e.to), e.to]);
      }
    }
  }

  const found = done.has(target);
  return {
    visited,
    found,
    cost: found ? cost.get(target) : Infinity,
    order,
    parent,
    path: record && found ? buildPath(prev, target) : [],
  };
}
