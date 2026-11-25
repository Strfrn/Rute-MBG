import { dijkstraTrace } from './dijkstra.js';

// Dijkstra Satu Arah Standar (Unidirectional Pairwise)
// Menjalankan pencarian melingkar melebar dari titik asal ke satu tujuan satu per satu
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

// Kompatibilitas default (menggunakan Dijkstra Naif Pairwise)
export function buildMatrix(adj, nodeIds, weightKey) {
  return buildMatrixNaiveDijkstra(adj, nodeIds, weightKey).matrix;
}
