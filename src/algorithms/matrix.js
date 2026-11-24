import { dijkstraTrace } from './dijkstra.js';
import { bidirectionalDijkstra, buildReverseAdj } from './bidirectional.js';

// 1. Pre-Peningkatan (Baseline): Dijkstra Satu Arah Standar (Unidirectional)
// Menjalankan pencarian melingkar melebar dari titik asal ke satu tujuan
export function buildMatrixNaiveDijkstra(adj, nodeIds, weightKey) {
  const n = nodeIds.length;
  let totalVisited = 0;
  let totalPushes = 0;
  let totalPops = 0;
  let totalExamined = 0;
  let totalRelaxed = 0;

  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        const res = dijkstraTrace(adj, nodeIds[i], [nodeIds[j]], weightKey);
        matrix[i][j] = res.results[0]?.found ? res.results[0].cost : Infinity;
        totalVisited += res.stats.visited;
        totalPushes += res.stats.pushes;
        totalPops += res.stats.pops;
        totalExamined += res.stats.examined;
        totalRelaxed += res.stats.relaxed;
      }
    }
  }

  return {
    matrix,
    stats: {
      visited: totalVisited,
      pushes: totalPushes,
      pops: totalPops,
      examined: totalExamined,
      relaxed: totalRelaxed,
      searches: n * (n - 1),
    },
  };
}

// 2. Peningkatan (Modifikasi): Bidirectional Dijkstra (Dua Arah Bertemu di Tengah)
// Menjalankan dua gelombang pencarian: Forward dari titik asal & Backward dari titik tujuan
// Memangkas hingga ~50% simpul yang dijelajahi pada graf jalan
export function buildMatrixBidirectionalDijkstra(adj, revAdj, nodeIds, weightKey) {
  const n = nodeIds.length;
  let totalVisited = 0;
  let totalPushes = 0;
  let totalPops = 0;
  let totalExamined = 0;
  let totalRelaxed = 0;

  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        const res = bidirectionalDijkstra(adj, revAdj, nodeIds[i], nodeIds[j], weightKey);
        matrix[i][j] = res.found ? res.cost : Infinity;
        totalVisited += res.stats.visited;
        totalPushes += res.stats.pushes;
        totalPops += res.stats.pops;
        totalExamined += res.stats.examined;
        totalRelaxed += res.stats.relaxed;
      }
    }
  }

  return {
    matrix,
    stats: {
      visited: totalVisited,
      pushes: totalPushes,
      pops: totalPops,
      examined: totalExamined,
      relaxed: totalRelaxed,
      searches: n * (n - 1),
    },
  };
}

// Kompatibilitas default
export function buildMatrix(adj, nodeIds, weightKey) {
  const revAdj = buildReverseAdj(adj);
  return buildMatrixBidirectionalDijkstra(adj, revAdj, nodeIds, weightKey).matrix;
}
