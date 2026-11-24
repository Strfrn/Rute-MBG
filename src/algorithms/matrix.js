import { dijkstraTrace } from './dijkstra.js';
import { bidirectionalDijkstra, buildReverseAdj } from './bidirectional.js';

// 1. Baseline: Dijkstra Satu Arah Standar (Unidirectional Pairwise)
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

// 2. Peningkatan (Modifikasi Opsi B): Multi-Target Batch Scan Dijkstra
// Memanfaatkan sifat Single-Source Shortest Path (SSSP):
// Dari 1 titik asal, langsung menemukan jarak ke SEMUA tujuan sekaligus dalam 1 sapuan gelombang.
// Memangkas jumlah pemanggilan graf dari N*(N-1) kali menjadi cukup N kali saja (Hemat hingga 75-88%).
export function buildMatrixBatchDijkstra(adj, nodeIds, weightKey) {
  const n = nodeIds.length;
  let totalVisited = 0;
  let totalPushes = 0;
  let totalPops = 0;
  let totalExamined = 0;
  let totalRelaxed = 0;

  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    // Kumpulkan seluruh tujuan selain simpul i
    const targets = [];
    for (let j = 0; j < n; j++) {
      if (i !== j) targets.push(nodeIds[j]);
    }

    // 1 kali scan langsung menjangkau semua target (dengan early stopping saat semua terjamah)
    const res = dijkstraTrace(adj, nodeIds[i], targets, weightKey);

    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
      } else {
        const item = res.results.find(r => r.target === nodeIds[j]);
        matrix[i][j] = item && item.found ? item.cost : Infinity;
      }
    }

    totalVisited += res.stats.visited;
    totalPushes += res.stats.pushes;
    totalPops += res.stats.pops;
    totalExamined += res.stats.examined;
    totalRelaxed += res.stats.relaxed;
  }

  return {
    matrix,
    stats: {
      visited: totalVisited,
      pushes: totalPushes,
      pops: totalPops,
      examined: totalExamined,
      relaxed: totalRelaxed,
      searches: n, // Cukup N kali eksekusi graf!
    },
  };
}

// 3. Bidirectional Dijkstra (Dua Arah Bertemu di Tengah) - Tersedia untuk referensi
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

// Kompatibilitas default (menggunakan Batch Scan yang paling efisien)
export function buildMatrix(adj, nodeIds, weightKey) {
  return buildMatrixBatchDijkstra(adj, nodeIds, weightKey).matrix;
}
