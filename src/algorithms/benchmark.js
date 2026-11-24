// ============================================================
// Automated Benchmark Runner
// Menjalankan kedua algoritma (Baseline & Peningkatan) sejumlah
// RUNS kali secara asinkron, mengukur waktu komputasi murni
// (tanpa rendering peta / animasi), lalu menghitung statistik.
// ============================================================

import { buildMatrixNaiveDijkstra, buildMatrixBatchDijkstra } from './matrix.js';
import { bruteForce, heldKarp } from './route.js';
import { applyBlockages } from './blockage.js';

const WARMUP = 2;  // run pemanasan (tidak dihitung ke statistik)

// Tidur sebentar agar UI browser sempat render (progress bar update)
function tick() {
  return new Promise(r => setTimeout(r, 0));
}

// Hitung statistik dari array angka
function stats(arr) {
  const n = arr.length;
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((s, x) => s + x, 0) / n;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  return {
    mean,
    min: sorted[0],
    max: sorted[n - 1],
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    stddev: Math.sqrt(variance),
    runs: arr,
  };
}

/**
 * Jalankan benchmark kedua algoritma.
 *
 * @param {object}   base       - { g, places, nodes } dari App
 * @param {Array}    blockages  - array blokade aktif
 * @param {string}   weightKey  - 'dist' | 'time'
 * @param {number}   runs       - jumlah run per algoritma (default 20)
 * @param {Function} onProgress - callback({ phase, done, total })
 *                                phase = 'warmup' | 'baseline' | 'peningkatan'
 * @returns {Promise<object>}   hasil statistik lengkap
 */
export async function runBenchmark(base, blockages, weightKey = 'dist', runs = 20, onProgress = () => {}) {
  const { g, nodes } = base;
  const adj = applyBlockages(g.adj, g.coords, blockages);
  const n = nodes.length;

  // --- helper: satu run baseline (Dijkstra Naif + Brute Force) ---
  function runBaseline() {
    const t0 = performance.now();
    const matrixRes = buildMatrixNaiveDijkstra(adj, nodes, weightKey);
    const matrixTime = performance.now() - t0;
    const full = matrixRes.matrix;

    // sub-matrix untuk TSP
    const sub = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => full[i][j]));
    const t1 = performance.now();
    bruteForce(sub);
    const tspTime = performance.now() - t1;
    return { matrixTime, tspTime, total: matrixTime + tspTime };
  }

  // --- helper: satu run peningkatan (Batch Scan + Held-Karp) ---
  function runPeningkatan() {
    const t0 = performance.now();
    const matrixRes = buildMatrixBatchDijkstra(adj, nodes, weightKey);
    const matrixTime = performance.now() - t0;
    const full = matrixRes.matrix;

    const sub = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => full[i][j]));
    const t1 = performance.now();
    heldKarp(sub);
    const tspTime = performance.now() - t1;
    return { matrixTime, tspTime, total: matrixTime + tspTime };
  }

  // ── 1. Pemanasan (JIT warm-up, tidak dihitung) ──────────────
  onProgress({ phase: 'warmup', done: 0, total: WARMUP });
  for (let i = 0; i < WARMUP; i++) {
    runBaseline();
    runPeningkatan();
    await tick();
    onProgress({ phase: 'warmup', done: i + 1, total: WARMUP });
  }

  // ── 2. Baseline: 20 run ──────────────────────────────────────
  const baselineRuns = [];
  const baselineMatrix = [];
  const baselineTsp = [];
  onProgress({ phase: 'baseline', done: 0, total: runs });
  for (let i = 0; i < runs; i++) {
    const r = runBaseline();
    baselineRuns.push(r.total);
    baselineMatrix.push(r.matrixTime);
    baselineTsp.push(r.tspTime);
    await tick();
    onProgress({ phase: 'baseline', done: i + 1, total: runs });
  }

  // ── 3. Peningkatan: 20 run ───────────────────────────────────
  const peningkatanRuns = [];
  const peningkatanMatrix = [];
  const peningkatanTsp = [];
  onProgress({ phase: 'peningkatan', done: 0, total: runs });
  for (let i = 0; i < runs; i++) {
    const r = runPeningkatan();
    peningkatanRuns.push(r.total);
    peningkatanMatrix.push(r.matrixTime);
    peningkatanTsp.push(r.tspTime);
    await tick();
    onProgress({ phase: 'peningkatan', done: i + 1, total: runs });
  }

  const baselineStat = stats(baselineRuns);
  const peningkatanStat = stats(peningkatanRuns);

  return {
    runs,
    weightKey,
    n,
    baseline: {
      total: baselineStat,
      matrix: stats(baselineMatrix),
      tsp: stats(baselineTsp),
    },
    peningkatan: {
      total: peningkatanStat,
      matrix: stats(peningkatanMatrix),
      tsp: stats(peningkatanTsp),
    },
    speedup: baselineStat.mean / peningkatanStat.mean,
  };
}

// ============================================================
// Export utilitas format tabel laporan
// ============================================================

function f(ms) { return ms.toFixed(3); }
function pct(a, b) { return b > 0 ? ((1 - a / b) * 100).toFixed(1) + '%' : '-'; }

/** Hasilkan string tabel Markdown untuk copy-paste ke laporan */
export function toMarkdownTable(result) {
  const { baseline: B, peningkatan: P, runs, n, speedup, weightKey } = result;
  const unit = weightKey === 'dist' ? 'jarak (m)' : 'waktu (det)';
  const lines = [
    `## Hasil Benchmark Algoritma Rute MBG`,
    ``,
    `**Bobot:** ${unit} · **Lokasi (N):** ${n} · **Jumlah Run:** ${runs}x (+ ${WARMUP}x warm-up, tidak dihitung)`,
    ``,
    `### Total Waktu Eksekusi (Matriks + TSP)`,
    ``,
    `| Metrik | Baseline | Peningkatan | Penurunan |`,
    `|--------|----------|-------------|-----------|`,
    `| Mean   | ${f(B.total.mean)} ms | ${f(P.total.mean)} ms | ${pct(P.total.mean, B.total.mean)} |`,
    `| Median | ${f(B.total.median)} ms | ${f(P.total.median)} ms | ${pct(P.total.median, B.total.median)} |`,
    `| Min    | ${f(B.total.min)} ms | ${f(P.total.min)} ms | ${pct(P.total.min, B.total.min)} |`,
    `| Max    | ${f(B.total.max)} ms | ${f(P.total.max)} ms | ${pct(P.total.max, B.total.max)} |`,
    `| Std Dev | ${f(B.total.stddev)} ms | ${f(P.total.stddev)} ms | - |`,
    ``,
    `**Faktor Percepatan (Speedup):** ${speedup.toFixed(2)}× lebih cepat`,
    ``,
    `### Waktu Pembentukan Matriks Jarak`,
    ``,
    `| Metrik | Baseline (Naif Pairwise) | Peningkatan (Batch Scan) |`,
    `|--------|--------------------------|--------------------------|`,
    `| Mean   | ${f(B.matrix.mean)} ms | ${f(P.matrix.mean)} ms |`,
    `| Median | ${f(B.matrix.median)} ms | ${f(P.matrix.median)} ms |`,
    ``,
    `### Waktu TSP Solver`,
    ``,
    `| Metrik | Baseline (Brute Force) | Peningkatan (Held-Karp DP) |`,
    `|--------|------------------------|---------------------------|`,
    `| Mean   | ${f(B.tsp.mean)} ms | ${f(P.tsp.mean)} ms |`,
    `| Median | ${f(B.tsp.median)} ms | ${f(P.tsp.median)} ms |`,
    ``,
    `### Log Per-Run (Total ms)`,
    ``,
    `| Run | Baseline | Peningkatan |`,
    `|-----|----------|-------------|`,
    ...Array.from({ length: runs }, (_, i) =>
      `| ${i + 1} | ${f(B.total.runs[i])} | ${f(P.total.runs[i])} |`
    ),
  ];
  return lines.join('\n');
}

/** Hasilkan string CSV untuk download */
export function toCsv(result) {
  const { baseline: B, peningkatan: P, runs } = result;
  const rows = [
    'run,baseline_total_ms,baseline_matrix_ms,baseline_tsp_ms,peningkatan_total_ms,peningkatan_matrix_ms,peningkatan_tsp_ms',
    ...Array.from({ length: runs }, (_, i) =>
      [
        i + 1,
        f(B.total.runs[i]), f(B.matrix.runs[i]), f(B.tsp.runs[i]),
        f(P.total.runs[i]), f(P.matrix.runs[i]), f(P.tsp.runs[i]),
      ].join(',')
    ),
    '',
    'metric,baseline_mean,baseline_median,baseline_min,baseline_max,baseline_stddev,peningkatan_mean,peningkatan_median,peningkatan_min,peningkatan_max,peningkatan_stddev',
    [
      'total_ms',
      f(B.total.mean), f(B.total.median), f(B.total.min), f(B.total.max), f(B.total.stddev),
      f(P.total.mean), f(P.total.median), f(P.total.min), f(P.total.max), f(P.total.stddev),
    ].join(','),
    [
      'matrix_ms',
      f(B.matrix.mean), f(B.matrix.median), f(B.matrix.min), f(B.matrix.max), f(B.matrix.stddev),
      f(P.matrix.mean), f(P.matrix.median), f(P.matrix.min), f(P.matrix.max), f(P.matrix.stddev),
    ].join(','),
    [
      'tsp_ms',
      f(B.tsp.mean), f(B.tsp.median), f(B.tsp.min), f(B.tsp.max), f(B.tsp.stddev),
      f(P.tsp.mean), f(P.tsp.median), f(P.tsp.min), f(P.tsp.max), f(P.tsp.stddev),
    ].join(','),
  ];
  return rows.join('\n');
}
