import { MinHeap } from './dijkstra.js';

// Membangun graf arah terbalik (reverse adjacency list) untuk pencarian backward
export function buildReverseAdj(adj) {
  const rev = new Map();
  for (const [from, edges] of adj) {
    for (const e of edges) {
      if (!rev.has(e.to)) rev.set(e.to, []);
      rev.get(e.to).push({ to: from, dist: e.dist, time: e.time });
    }
  }
  return rev;
}

// 1. Bidirectional Dijkstra Cepat (untuk perhitungan matriks)
// Menjalankan gelombang maju dari start dan mundur dari target
// Kompleksitas Ruang & Simpul berkurang hingga ~50% dibanding Dijkstra satu arah
export function bidirectionalDijkstra(adj, revAdj, start, target, weightKey) {
  if (start === target) {
    return {
      found: true,
      cost: 0,
      path: [start],
      stats: { visited: 1, pushes: 1, pops: 0, examined: 0, relaxed: 0 },
    };
  }

  const costF = new Map([[start, 0]]);
  const costB = new Map([[target, 0]]);
  const prevF = new Map();
  const prevB = new Map();
  const doneF = new Set();
  const doneB = new Set();

  const heapF = new MinHeap();
  const heapB = new MinHeap();
  heapF.push([0, start]);
  heapB.push([0, target]);

  let mu = Infinity;
  let bestMeetingNode = null;
  let pushes = 2, pops = 0, examined = 0, relaxed = 0;
  let visitedF = 0, visitedB = 0;

  while (heapF.size && heapB.size) {
    const minF = heapF.a[0][0];
    const minB = heapB.a[0][0];
    // Kriteria Berhenti Optimal: jika minF + minB >= mu, jalur terpendek mutlak sudah ditemukan
    if (minF + minB >= mu) break;

    // Seimbangkan ekspansi pencarian maju dan mundur
    if (minF <= minB) {
      const [c, u] = heapF.pop();
      pops++;
      if (doneF.has(u)) continue;
      doneF.add(u);
      visitedF++;

      for (const e of adj.get(u) || []) {
        examined++;
        const nc = c + e[weightKey];
        if (nc < (costF.get(e.to) ?? Infinity)) {
          costF.set(e.to, nc);
          prevF.set(e.to, u);
          heapF.push([nc, e.to]);
          relaxed++;
          pushes++;

          if (costB.has(e.to)) {
            const total = nc + costB.get(e.to);
            if (total < mu) {
              mu = total;
              bestMeetingNode = e.to;
            }
          }
        }
      }
    } else {
      const [c, u] = heapB.pop();
      pops++;
      if (doneB.has(u)) continue;
      doneB.add(u);
      visitedB++;

      for (const e of revAdj.get(u) || []) {
        examined++;
        const nc = c + e[weightKey];
        if (nc < (costB.get(e.to) ?? Infinity)) {
          costB.set(e.to, nc);
          prevB.set(e.to, u);
          heapB.push([nc, e.to]);
          relaxed++;
          pushes++;

          if (costF.has(e.to)) {
            const total = costF.get(e.to) + nc;
            if (total < mu) {
              mu = total;
              bestMeetingNode = e.to;
            }
          }
        }
      }
    }
  }

  const found = bestMeetingNode !== null && isFinite(mu);
  if (!found) {
    return {
      found: false,
      cost: Infinity,
      path: [],
      stats: { visited: visitedF + visitedB, pushes, pops, examined, relaxed },
    };
  }

  // Rekonstruksi rute lengkap dari start -> meetingNode -> target
  const pathForward = [];
  let curr = bestMeetingNode;
  while (curr !== undefined && curr !== null) {
    pathForward.push(curr);
    if (curr === start) break;
    curr = prevF.get(curr);
  }
  pathForward.reverse();

  const pathBackward = [];
  curr = prevB.get(bestMeetingNode);
  while (curr !== undefined && curr !== null) {
    pathBackward.push(curr);
    if (curr === target) break;
    curr = prevB.get(curr);
  }

  return {
    found: true,
    cost: mu,
    meetingNode: bestMeetingNode,
    path: [...pathForward, ...pathBackward],
    stats: {
      visited: visitedF + visitedB,
      visitedF,
      visitedB,
      pushes,
      pops,
      examined,
      relaxed,
    },
  };
}

// 2. Bidirectional Dijkstra dengan Rekaman Jejak (untuk visualisasi canvas animatif)
export function bidirectionalDijkstraTrace(adj, revAdj, start, target, weightKey) {
  if (start === target) {
    return {
      found: true,
      cost: 0,
      path: [start],
      meetingNode: start,
      orderF: [start],
      parentF: [null],
      orderB: [],
      parentB: [],
      stats: { visited: 1, pushes: 1, pops: 0, examined: 0, relaxed: 0 },
    };
  }

  const costF = new Map([[start, 0]]);
  const costB = new Map([[target, 0]]);
  const prevF = new Map();
  const prevB = new Map();
  const doneF = new Set();
  const doneB = new Set();

  const heapF = new MinHeap();
  const heapB = new MinHeap();
  heapF.push([0, start]);
  heapB.push([0, target]);

  let mu = Infinity;
  let bestMeetingNode = null;
  let pushes = 2, pops = 0, examined = 0, relaxed = 0;

  const orderF = [];
  const parentF = [];
  const orderB = [];
  const parentB = [];

  while (heapF.size && heapB.size) {
    const minF = heapF.a[0][0];
    const minB = heapB.a[0][0];
    if (minF + minB >= mu) break;

    if (minF <= minB) {
      const [c, u] = heapF.pop();
      pops++;
      if (doneF.has(u)) continue;
      doneF.add(u);
      orderF.push(u);
      parentF.push(prevF.has(u) ? prevF.get(u) : null);

      for (const e of adj.get(u) || []) {
        examined++;
        const nc = c + e[weightKey];
        if (nc < (costF.get(e.to) ?? Infinity)) {
          costF.set(e.to, nc);
          prevF.set(e.to, u);
          heapF.push([nc, e.to]);
          relaxed++;
          pushes++;

          if (costB.has(e.to)) {
            const total = nc + costB.get(e.to);
            if (total < mu) {
              mu = total;
              bestMeetingNode = e.to;
            }
          }
        }
      }
    } else {
      const [c, u] = heapB.pop();
      pops++;
      if (doneB.has(u)) continue;
      doneB.add(u);
      orderB.push(u);
      parentB.push(prevB.has(u) ? prevB.get(u) : null);

      for (const e of revAdj.get(u) || []) {
        examined++;
        const nc = c + e[weightKey];
        if (nc < (costB.get(e.to) ?? Infinity)) {
          costB.set(e.to, nc);
          prevB.set(e.to, u);
          heapB.push([nc, e.to]);
          relaxed++;
          pushes++;

          if (costF.has(e.to)) {
            const total = costF.get(e.to) + nc;
            if (total < mu) {
              mu = total;
              bestMeetingNode = e.to;
            }
          }
        }
      }
    }
  }

  const found = bestMeetingNode !== null && isFinite(mu);
  if (!found) {
    return {
      found: false,
      cost: Infinity,
      path: [],
      meetingNode: null,
      orderF,
      parentF,
      orderB,
      parentB,
      stats: { visited: orderF.length + orderB.length, pushes, pops, examined, relaxed },
    };
  }

  const pathForward = [];
  let curr = bestMeetingNode;
  while (curr !== undefined && curr !== null) {
    pathForward.push(curr);
    if (curr === start) break;
    curr = prevF.get(curr);
  }
  pathForward.reverse();

  const pathBackward = [];
  curr = prevB.get(bestMeetingNode);
  while (curr !== undefined && curr !== null) {
    pathBackward.push(curr);
    if (curr === target) break;
    curr = prevB.get(curr);
  }

  return {
    found: true,
    cost: mu,
    meetingNode: bestMeetingNode,
    path: [...pathForward, ...pathBackward],
    orderF,
    parentF,
    orderB,
    parentB,
    stats: {
      visited: orderF.length + orderB.length,
      visitedF: orderF.length,
      visitedB: orderB.length,
      pushes,
      pops,
      examined,
      relaxed,
    },
  };
}
