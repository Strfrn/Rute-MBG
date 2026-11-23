import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import { buildGraph, haversine } from './algorithms/graph.js';
import { largestComponent, snapPoint } from './algorithms/snap.js';
import { buildMatrix } from './algorithms/matrix.js';
import { bruteForce, naiveRoute, routeCost } from './algorithms/route.js';
import { routeToCoords, routeToLegs } from './algorithms/roadPath.js';
import { applyBlockages, makeBlockage } from './algorithms/blockage.js';
import { dijkstra, dijkstraTrace } from './algorithms/dijkstra.js';
import { astar, maxSpeed } from './algorithms/astar.js';

const LEG_COLORS = [
  '#2563eb', '#ea580c', '#16a34a', '#7c3aed',
  '#db2777', '#0891b2', '#ca8a04', '#65a30d',
];

// Warna perjalanan ke-k. Perjalanan terakhir (pulang ke dapur) abu-abu gelap.
function legColor(k, total) {
  if (k === total - 1) return '#334155';
  if (k < LEG_COLORS.length) return LEG_COLORS[k];
  return `hsl(${(k * 137.5) % 360} 65% 42%)`;
}

const STORE_KEY = 'mbg-data-v1'; // kunci penyimpanan data lokasi di browser
const MAX_SCHOOLS = 9; // batas brute force

// Warna jalur hasil Dijkstra (dibuat beda dari warna pencarian)
const DJ_COLORS = [
  '#e11d48', '#f97316', '#16a34a', '#111827',
  '#b45309', '#be185d', '#4d7c0f', '#7f1d1d',
];
function djColor(k) {
  return k < DJ_COLORS.length ? DJ_COLORS[k] : `hsl(${(k * 137.5) % 360} 70% 40%)`;
}

// Angka untuk penjelasan perhitungan (satuan dasar: meter atau detik)
function fmtN(key, v) {
  return key === 'dist' ? Math.round(v).toLocaleString('id-ID') + ' m' : v.toFixed(1) + ' detik';
}

// Contoh perhitungan untuk satu simpul (di tengah) pada jalur ke tujuan pertama
function explainExample(adj, coords, path, key, vmax) {
  if (!path || path.length < 3) return null;
  const g = [0];
  for (let i = 1; i < path.length; i++) {
    const costs = (adj.get(path[i - 1]) || []).filter(e => e.to === path[i]).map(e => e[key]);
    g.push(g[i - 1] + (costs.length ? Math.min(...costs) : 0));
  }
  const total = g[g.length - 1];
  const k = Math.floor((path.length - 1) / 2);
  const d = haversine(coords.get(path[k]), coords.get(path[path.length - 1]));
  return { k, n: path.length, g: g[k], h: key === 'dist' ? d : d / vmax, remaining: total - g[k] };
}

function sumStats(list) {
  const z = { visited: 0, pops: 0, pushes: 0, examined: 0, relaxed: 0 };
  for (const st of list) for (const k of Object.keys(z)) z[k] += st[k];
  return z;
}

// Teks "berkurang 12.3%" / "bertambah 4.0%" dari jumlah a dibanding b
function reduction(a, b) {
  const v = (1 - a / b) * 100;
  return (v >= 0 ? 'berkurang ' : 'bertambah ') + Math.abs(v).toFixed(1) + '%';
}

function fmt(key, v) {
  if (key === 'dist') return v >= 1000 ? (v / 1000).toFixed(2) + ' km' : Math.round(v) + ' m';
  return (v / 60).toFixed(1) + ' menit';
}

function pin(label, kind, active, color) {
  const bg = active ? '#111' : color;
  const style = bg ? ` style="background:${bg}"` : '';
  return L.divIcon({
    className: '',
    html: `<div class="pin ${kind}${active ? ' active' : ''}"${style}>${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// Hitung rute terbaik untuk kondisi blokade tertentu
function solve(base, blockages) {
  const { g, places, nodes } = base;
  const adj = applyBlockages(g.adj, g.coords, blockages);
  const result = {};
  let unreachable = [];

  for (const key of ['dist', 'time']) {
    const full = buildMatrix(adj, nodes, key);

    // Sekolah yang masih bisa dicapai dari dapur dan bisa kembali
    const idx = places
      .map((_, i) => i)
      .filter(i => i === 0 || (full[0][i] < Infinity && full[i][0] < Infinity));
    const sub = idx.map(i => idx.map(j => full[i][j]));

    const route = bruteForce(sub).map(k => idx[k]);
    const naive = naiveRoute(idx.length).map(k => idx[k]);

    result[key] = {
      matrix: full,
      route,
      cost: routeCost(full, route),
      legs: routeToLegs(adj, g.coords, nodes, route, key),
      naiveCost: routeCost(full, naive),
      naiveLine: routeToCoords(adj, g.coords, nodes, naive, key),
    };
    if (key === 'dist') unreachable = places.map((_, i) => i).filter(i => !idx.includes(i));
  }
  return { result, unreachable };
}

// Membuat peta terbang ke lokasi yang diklik
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 16, { duration: 0.8 });
  }, [target, map]);
  return null;
}

// Menangkap klik di peta saat mode "tambah blokade" aktif
function ClickHandler({ active, onClick }) {
  const map = useMap();
  useMapEvents({
    click: e => {
      if (active) onClick(e.latlng);
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = active ? 'crosshair' : '';
  }, [active, map]);
  return null;
}

// Menggambar hasil pencarian Dijkstra: titik dan garis ke simpul induknya (satu layer kanvas)
function SearchLayer({ coords, parents, step, color = '#06b6d4' }) {
  const map = useMap();
  const layerRef = useRef(null);
  const rendererRef = useRef(null);
  const shownRef = useRef(0);

  useEffect(() => {
    rendererRef.current = L.canvas({ padding: 0.5 });
    layerRef.current = L.layerGroup().addTo(map);
    return () => layerRef.current.remove();
  }, [map]);

  // Data baru: hapus gambar lama
  useEffect(() => {
    layerRef.current.clearLayers();
    shownRef.current = 0;
  }, [coords]);

  // Tambahkan simpul dan garis baru sesuai kemajuan animasi
  useEffect(() => {
    const layer = layerRef.current;
    const n = Math.min(step, coords.length);
    if (n < shownRef.current) {
      layer.clearLayers();
      shownRef.current = 0;
    }
    for (let i = shownRef.current; i < n; i++) {
      const c = coords[i];
      const p = parents[i];
      if (p) {
        L.polyline([[p.lat, p.lon], [c.lat, c.lon]], {
          renderer: rendererRef.current,
          color,
          weight: 3,
          opacity: 1,
          interactive: false,
        }).addTo(layer);
      }
      L.circleMarker([c.lat, c.lon], {
        renderer: rendererRef.current,
        radius: 2.5,
        stroke: false,
        fillColor: color,
        fillOpacity: 1,
        interactive: false,
      }).addTo(layer);
    }
    shownRef.current = n;
  }, [step, coords, parents, color]);

  return null;
}

// Zoom peta supaya seluruh titik di "bounds" terlihat
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length) {
      map.flyToBounds(bounds, { padding: [60, 60], duration: 0.8, maxZoom: 17 });
    }
  }, [bounds, map]);
  return null;
}

export default function App() {
  const [roads, setRoads] = useState(null);
  const [data, setData] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [objective, setObjective] = useState('dist');
  const [showNaive, setShowNaive] = useState(true);
  const [active, setActive] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [drawn, setDrawn] = useState(0);
  const [replay, setReplay] = useState(0);
  const [blockages, setBlockages] = useState([]);
  const [mapMode, setMapMode] = useState('none'); // 'none' | 'blockage' | 'school' | 'kitchen'
  const [blockNote, setBlockNote] = useState('');
  const [mode, setMode] = useState('normal'); // 'normal', 'dijkstra', atau 'astar'
  const [wText, setWText] = useState('1'); // bobot heuristik A*
  const [snaps, setSnaps] = useState({ dijkstra: null, astar: null }); // hasil simulasi terakhir
  const [dijkTargets, setDijkTargets] = useState(null); // null = pakai 3 sekolah pertama pada rute
  const [dijkStep, setDijkStep] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch('/data/data.json').then(r => r.json()),
      fetch('/data/roads.json').then(r => r.json()),
    ]).then(([file, roadsJson]) => {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(STORE_KEY));
      } catch (e) {}
      const ok = saved && saved.kitchen && Array.isArray(saved.schools);
      setFileData(file);
      setData(ok ? saved : file);
      setRoads(roadsJson);
    });
  }, []);

  // Graph jalan: dihitung sekali
  const graphBase = useMemo(() => {
    if (!roads) return null;
    const g = buildGraph(roads);
    return { g, main: largestComponent(g.adj) };
  }, [roads]);

  // Snapping: dihitung ulang hanya kalau koordinat berubah (mengganti nama tidak memicunya)
  const geoKey = data
    ? JSON.stringify([data.kitchen.lat, data.kitchen.lng, ...data.schools.flatMap(s => [s.lat, s.lng])])
    : '';
  const base = useMemo(() => {
    if (!graphBase || !data) return null;
    const places = [data.kitchen, ...data.schools];
    const nodes = places.map(p => snapPoint(p, graphBase.g.coords, graphBase.main).nodeId);
    return { g: graphBase.g, places, nodes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphBase, geoKey]);

  // Rute tanpa blokade, untuk pembanding
  const baseline = useMemo(() => (base ? solve(base, []) : null), [base]);

  // Rute dengan blokade, dihitung ulang tiap blokade berubah
  const plan = useMemo(() => (base ? solve(base, blockages) : null), [base, blockages]);

  const current = plan ? plan.result[objective] : null;

  // Sekolah tujuan untuk visualisasi Dijkstra (default: 3 sekolah pertama pada rute)
  const defaultTargets = useMemo(() => {
    if (!plan) return [1];
    const stops = plan.result[objective].route.slice(1, -1).slice(0, 3);
    return stops.length ? stops : [1];
  }, [plan, objective]);
  const targets = dijkTargets ?? defaultTargets;

  // Graph setelah blokade, dipakai visualisasi Dijkstra
  const adjNow = useMemo(
    () => (base ? applyBlockages(base.g.adj, base.g.coords, blockages) : null),
    [base, blockages]
  );

  // Ukuran graph (setelah blokade): V simpul, E ruas berarah
  const graphStats = useMemo(() => {
    if (!adjNow) return null;
    let E = 0;
    for (const list of adjNow.values()) E += list.length;
    return { V: adjNow.size, E };
  }, [adjNow]);

  // Satu pencarian Dijkstra untuk semua tujuan (waktunya diukur di `compare`)
  const dijk = useMemo(() => {
    if (mode !== 'dijkstra' || !base || !adjNow) return null;
    const valid = targets.filter(t => t > 0 && t < base.nodes.length);
    if (!valid.length) return null;
    const from = base.nodes[0];
    const toNodes = valid.map(t => base.nodes[t]);
    const t = dijkstraTrace(adjNow, from, toNodes, objective);
    const vmax = maxSpeed(adjNow) * 1.000001;

    const co = id => base.g.coords.get(id);
    const routes = t.results.map((r, k) => ({
      place: valid[k],
      found: r.found,
      cost: r.cost,
      latlngs: r.path.map(id => [co(id).lat, co(id).lon]),
    }));
    const pts = routes.flatMap(r => r.latlngs);
    const bounds = pts.length ? pts : [[base.places[0].lat, base.places[0].lng]];
    return {
      routes,
      bounds,
      orderCoords: t.order.map(co),
      parentCoords: t.parent.map(p => (p === null ? null : co(p))),
      explain: {
        ex: explainExample(adjNow, base.g.coords, t.results[0].path, objective, vmax),
        stats: t.stats,
        place: valid[0],
        vmaxKmh: vmax * 3.6,
      },
    };
  }, [mode, base, adjNow, targets, objective]);

  // Bobot heuristik A* (1 sampai 5)
  const astarW = Math.max(1, Math.min(5, parseFloat(String(wText).replace(',', '.')) || 1));

  // A* untuk tiap tujuan (satu per satu), untuk visualisasi
  const astarRes = useMemo(() => {
    if (mode !== 'astar' || !base || !adjNow) return null;
    const valid = targets.filter(t => t > 0 && t < base.nodes.length);
    if (!valid.length) return null;
    const from = base.nodes[0];
    const toNodes = valid.map(t => base.nodes[t]);
    const coords = base.g.coords;
    const co = id => coords.get(id);
    const vmax = maxSpeed(adjNow) * 1.000001;

    const A = toNodes.map(to => astar(adjNow, coords, from, to, objective, astarW, vmax, true));
    const routes = A.map((r, k) => ({
      place: valid[k],
      found: r.found,
      cost: r.cost,
      latlngs: r.path.map(id => [co(id).lat, co(id).lon]),
    }));
    const pts = routes.flatMap(r => r.latlngs);
    return {
      routes,
      bounds: pts.length ? pts : [[base.places[0].lat, base.places[0].lng]],
      orderCoords: A.flatMap(r => r.order).map(co),
      parentCoords: A.flatMap(r => r.parent).map(p => (p === null ? null : co(p))),
      explain: {
        ex: explainExample(adjNow, coords, A[0].path, objective, vmax),
        stats: sumStats(A.map(r => r.stats)),
        place: valid[0],
        vmaxKmh: vmax * 3.6,
      },
    };
  }, [mode, base, adjNow, targets, objective, astarW]);

  // Perbandingan untuk tujuan yang sama, dihitung di mode Dijkstra maupun A*:
  //   S = Dijkstra sekali jalan untuk semua tujuan (berbagi satu gelombang pencarian)
  //   D = Dijkstra dijalankan terpisah untuk tiap tujuan
  //   A = A* dijalankan terpisah untuk tiap tujuan
  const compare = useMemo(() => {
    if (mode === 'normal' || !base || !adjNow) return null;
    const valid = targets.filter(t => t > 0 && t < base.nodes.length);
    if (!valid.length) return null;
    const from = base.nodes[0];
    const toNodes = valid.map(t => base.nodes[t]);
    const coords = base.g.coords;
    const vmax = maxSpeed(adjNow) * 1.000001;

    // Jumlah simpul dan biaya jalur
    const A = toNodes.map(to => astar(adjNow, coords, from, to, objective, astarW, vmax));
    const D = toNodes.map(to => dijkstraTrace(adjNow, from, [to], objective));
    const S = dijkstraTrace(adjNow, from, toNodes, objective);

    // Waktu: rata-rata 20 kali, tanpa merekam apa pun
    const bench = fn => {
      fn(); // pemanasan
      const RUNS = 20;
      const t0 = performance.now();
      for (let i = 0; i < RUNS; i++) fn();
      return (performance.now() - t0) / RUNS;
    };
    const msA = bench(() => toNodes.forEach(to => astar(adjNow, coords, from, to, objective, astarW, vmax)));
    const msD = bench(() => toNodes.forEach(to => dijkstra(adjNow, from, objective, [to])));
    const msS = bench(() => dijkstra(adjNow, from, objective, toNodes));

    let costGap = 0;
    A.forEach((r, k) => {
      const d = D[k].results[0].cost;
      if (isFinite(r.cost) && isFinite(d) && d > 0) costGap = Math.max(costGap, (r.cost - d) / d);
    });

    return {
      visitedA: A.reduce((sum, r) => sum + r.visited, 0),
      visitedD: D.reduce((sum, r) => sum + r.order.length, 0),
      visitedS: S.order.length,
      msA,
      msD,
      msS,
      costGap,
    };
  }, [mode, base, adjNow, targets, objective, astarW]);

  // Hasil simulasi disimpan per algoritma, dan hanya berlaku untuk kondisi yang sama
  // (tujuan, jenis bobot, blokade, lokasi). Kalau kondisi berubah, tabel kembali ke 0.
  const condKey = JSON.stringify([objective, targets, blockages.map(b => b.id), geoKey]);
  useEffect(() => {
    if (!compare) return;
    if (mode === 'dijkstra') {
      setSnaps(sn => ({
        ...sn,
        dijkstra: {
          key: condKey,
          visitedS: compare.visitedS,
          msS: compare.msS,
          visitedD: compare.visitedD,
          msD: compare.msD,
        },
      }));
    } else if (mode === 'astar') {
      setSnaps(sn => ({
        ...sn,
        astar: {
          key: condKey + '|' + astarW,
          visitedA: compare.visitedA,
          msA: compare.msA,
          costGap: compare.costGap,
        },
      }));
    }
  }, [compare, mode, condKey, astarW]);

  // Hasil yang sedang divisualisasikan (Dijkstra atau A*)
  const viz = mode === 'astar' ? astarRes : dijk;

  // Animasi pencarian
  useEffect(() => {
    if (!viz) return;
    const total = viz.orderCoords.length;
    const step = Math.max(1, Math.ceil(total / 120));
    setDijkStep(0);
    const id = setInterval(() => {
      setDijkStep(d => {
        if (d + step >= total) {
          clearInterval(id);
          return total;
        }
        return d + step;
      });
    }, 30);
    return () => clearInterval(id);
  }, [viz, replay]);

  // Animasi menggambar garis rute
  useEffect(() => {
    if (!current) return;
    const total = current.legs.flat().length;
    const step = Math.max(1, Math.ceil(total / 120));
    setDrawn(0);
    const id = setInterval(() => {
      setDrawn(d => {
        if (d + step >= total) {
          clearInterval(id);
          return total;
        }
        return d + step;
      });
    }, 25);
    return () => clearInterval(id);
  }, [current, replay]);

  if (!plan) return <p style={{ padding: 20 }}>Menghitung rute...</p>;

  // Nilai tabel perbandingan: 0 sampai simulasinya dijalankan
  const dSnap = snaps.dijkstra && snaps.dijkstra.key === condKey ? snaps.dijkstra : null;
  const aSnap = snaps.astar && snaps.astar.key === condKey + '|' + astarW ? snaps.astar : null;
  const num = v => v.toLocaleString('id-ID');
  const ex = mode !== 'normal' && viz ? viz.explain : null;

  const places = [data.kitchen, ...data.schools];
  const { unreachable } = plan;
  const { route, cost, naiveCost, matrix } = current;
  const baseCost = baseline.result[objective].cost;
  const delta = cost - baseCost;
  const word = objective === 'dist' ? 'jarak' : 'waktu';

  // Potong tiap perjalanan sesuai progres animasi, dan beri warna
  const totalLegs = current.legs.length;
  let offset = 0;
  const legParts = (mode === 'normal' ? current.legs : []).map((leg, k) => {
    const visible = Math.max(0, Math.min(leg.length, drawn - offset));
    offset += leg.length;
    return { points: leg.slice(0, visible), color: legColor(k, totalLegs) };
  });

  const select = i => {
    setActive(i);
    setFlyTarget([places[i].lat, places[i].lng]);
  };

  // Klik di dekat jalan -> pasang palang yang menutup ruas jalan itu
  const addBlockage = ll => {
    const b = makeBlockage(base.g.adj, base.g.coords, ll);
    if (!b) {
      setBlockNote('Tidak ada jalan yang bisa dilewati di dekat titik itu. Klik tepat di jalan.');
      return;
    }
    if (blockages.some(x => (x.a === b.a && x.b === b.b) || (x.a === b.b && x.b === b.a))) {
      setBlockNote('Ruas jalan itu sudah diblokir.');
      return;
    }
    setBlockNote('');
    setBlockages(list => [...list, { id: Date.now() + Math.random(), ...b }]);
  };
  const toggleTarget = i => {
    if (targets.includes(i)) {
      if (targets.length > 1) setDijkTargets(targets.filter(x => x !== i));
    } else {
      setDijkTargets([...targets, i]);
    }
  };
  const removeBlockage = id => setBlockages(list => list.filter(b => b.id !== id));

  // ---- CRUD lokasi ----
  const commit = next => {
    setData(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch (e) {}
  };
  const addSchool = ll => {
    if (data.schools.length >= MAX_SCHOOLS) {
      setMapMode('none');
      return;
    }
    const id = data.schools.reduce((m, sc) => Math.max(m, sc.id || 0), 0) + 1;
    commit({
      ...data,
      schools: [...data.schools, { id, name: 'Sekolah baru ' + id, lat: ll.lat, lng: ll.lng, students: 300 }],
    });
  };
  const updateSchool = (i, patch) =>
    commit({ ...data, schools: data.schools.map((sc, k) => (k === i ? { ...sc, ...patch } : sc)) });
  const removeSchool = i => {
    commit({ ...data, schools: data.schools.filter((_, k) => k !== i) });
    setDijkTargets(null);
    setActive(null);
  };
  const updateKitchen = patch => commit({ ...data, kitchen: { ...data.kitchen, ...patch } });
  const moveLocation = (i, ll) => {
    const patch = { lat: ll.lat, lng: ll.lng };
    if (i === 0) updateKitchen(patch);
    else updateSchool(i - 1, patch);
  };
  const resetData = () => {
    if (!window.confirm('Kembalikan ke data.json awal? Perubahan yang belum diunduh akan hilang.')) return;
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (e) {}
    setData(fileData);
    setDijkTargets(null);
    setActive(null);
  };
  const downloadData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    a.click();
  };
  const onMapClick = ll => {
    if (mapMode === 'blockage') addBlockage(ll);
    else if (mapMode === 'school') addSchool(ll);
    else if (mapMode === 'kitchen') {
      updateKitchen({ lat: ll.lat, lng: ll.lng });
      setMapMode('none');
    }
  };
  const toggleMode = m => {
    setBlockNote('');
    setMapMode(cur => (cur === m ? 'none' : m));
  };

  return (
    <div className={'layout' + (mode !== 'normal' ? ' dj-mode' : '')}>
      <aside className="panel">
        <header className="brand">
          <h1>Rute pengantaran MBG</h1>
          <p className="sub">
            <b>{places[0].name}</b> → {places.length - 1} sekolah
          </p>
        </header>

        <div className="sec">
          <div className="dj-row">
            <button
              className={'dj-btn' + (mode === 'dijkstra' ? ' on' : '')}
              onClick={() => setMode(m => (m === 'dijkstra' ? 'normal' : 'dijkstra'))}
            >
              Dijkstra
            </button>
            <button
              className={'dj-btn' + (mode === 'astar' ? ' on' : '')}
              onClick={() => setMode(m => (m === 'astar' ? 'normal' : 'astar'))}
            >
              A*
            </button>
            {mode !== 'normal' && compare && (
              <span className="dj-ms">
                <b>{(mode === 'astar' ? compare.msA : compare.msS).toFixed(2)}</b> ms
              </span>
            )}
          </div>
          {mode === 'astar' && (
            <label className="dj-w">
              <span className="lbl">Bobot heuristik (w)</span>
              <input type="text" inputMode="decimal" value={wText} onChange={e => setWText(e.target.value)} />
              <span className="note">
                1 = jalur dijamin optimal. Lebih besar = simpul dikunjungi lebih sedikit, tapi jalur bisa lebih
                panjang. Batas 1 sampai 5.
              </span>
            </label>
          )}
          {mode !== 'normal' && viz && (
            <div className="dj-info">
              <span className="lbl">Tujuan (boleh lebih dari satu)</span>
              <div className="dj-targets">
                {places.slice(1).map((p, k) => {
                  const i = k + 1;
                  const on = targets.includes(i);
                  const r = viz.routes.find(x => x.place === i);
                  return (
                    <label key={i} className="dj-target">
                      <input type="checkbox" checked={on} onChange={() => toggleTarget(i)} />
                      <span className="dj-dot" style={{ background: on ? djColor(targets.indexOf(i)) : '#6b7280' }} />
                      <span className="name">{p.name}</span>
                      {r && <span className="leg">{r.found ? fmt(objective, r.cost) : 'terputus'}</span>}
                    </label>
                  );
                })}
              </div>
              <p className="note">
                {viz.orderCoords.length.toLocaleString('id-ID')} simpul dikunjungi untuk {targets.length} tujuan
                {mode === 'astar' ? ', dicari satu per satu' : ' sekaligus'}. Waktu = rata-rata 20 kali pencarian,
                tanpa animasi.
              </p>
            </div>
          )}
          <div className="toggle">
            <button className={objective === 'dist' ? 'on' : ''} onClick={() => setObjective('dist')}>
              Jarak terpendek
            </button>
            <button className={objective === 'time' ? 'on' : ''} onClick={() => setObjective('time')}>
              Waktu tercepat
            </button>
          </div>
        </div>

        <div className="sec">
          <span className="lbl">{objective === 'dist' ? 'Jarak' : 'Waktu'} rute terbaik</span>
          <b className="big">{fmt(objective, cost)}</b>
        </div>

        <div className="hazard">
          <div className="hz-head">
            <b>Blokade jalan</b>
            <span className="count">{blockages.length}</span>
          </div>
          <button className={'btn' + (mapMode === 'blockage' ? ' on' : '')} onClick={() => toggleMode('blockage')}>
            {mapMode === 'blockage' ? 'Selesai menambah' : 'Tambah blokade (klik peta)'}
          </button>
          {blockNote && <p className="note">{blockNote}</p>}

          {blockages.length === 0 && (
            <p className="note">Belum ada blokade. Aktifkan tombol di atas, lalu klik di jalan yang ingin ditutup.</p>
          )}

          {blockages.map((b, k) => (
            <div key={b.id} className="hz-item">
              <span>Blokade {k + 1}</span>
              <button className="small" onClick={() => removeBlockage(b.id)}>Hapus</button>
            </div>
          ))}
          {blockages.length > 1 && (
            <button className="small" onClick={() => setBlockages([])}>Hapus semua</button>
          )}

          {blockages.length > 0 && unreachable.length === 0 && (
            <p className="note impact">
              {delta > 0.5
                ? `Dampak: ${word} bertambah ${fmt(objective, delta)} (tanpa blokade ${fmt(objective, baseCost)}).`
                : 'Blokade ini tidak mengubah rute terbaik.'}
            </p>
          )}
        </div>

        <div className="sec">
          <div className="hz-head">
            <b>Lokasi</b>
            <span className="count">{data.schools.length} sekolah</span>
          </div>
          <div className="loc-actions">
            <button
              className={'btn' + (mapMode === 'school' ? ' on' : '')}
              onClick={() => toggleMode('school')}
              disabled={data.schools.length >= MAX_SCHOOLS && mapMode !== 'school'}
            >
              {mapMode === 'school' ? 'Selesai menambah' : 'Tambah sekolah (klik peta)'}
            </button>
            <button className={'btn' + (mapMode === 'kitchen' ? ' on' : '')} onClick={() => toggleMode('kitchen')}>
              {mapMode === 'kitchen' ? 'Klik lokasi dapur baru' : 'Pindahkan dapur (klik peta)'}
            </button>
          </div>
          {data.schools.length >= MAX_SCHOOLS && (
            <p className="note">Maksimal {MAX_SCHOOLS} sekolah (batas brute force).</p>
          )}
          <div className="loc-list">
            <div className="loc-row">
              <span className="badge kitchen" onClick={() => select(0)}>D</span>
              <input
                className="loc-name"
                value={data.kitchen.name ?? ''}
                onChange={e => updateKitchen({ name: e.target.value })}
                aria-label="Nama dapur"
              />
            </div>
            {data.schools.map((sc, k) => (
              <div className="loc-row" key={sc.id ?? k}>
                <span className="badge" style={{ background: '#6b7280' }} onClick={() => select(k + 1)}>•</span>
                <input
                  className="loc-name"
                  value={sc.name ?? ''}
                  onChange={e => updateSchool(k, { name: e.target.value })}
                  aria-label="Nama sekolah"
                />
                <input
                  className="loc-num"
                  type="number"
                  min="0"
                  value={sc.students ?? 0}
                  onChange={e => updateSchool(k, { students: Number(e.target.value) || 0 })}
                  aria-label="Jumlah siswa"
                  title="Jumlah siswa"
                />
                <button className="small" onClick={() => removeSchool(k)}>Hapus</button>
              </div>
            ))}
          </div>
          <p className="note">Geser marker di peta untuk memindahkan lokasi. Perubahan tersimpan di browser ini.</p>
          <div className="loc-actions">
            <button className="small" onClick={downloadData}>Unduh data.json</button>
            <button className="small" onClick={resetData}>Kembalikan data awal</button>
          </div>
        </div>

        {unreachable.length > 0 && (
          <div className="warn">
            <b>Tidak terjangkau:</b> {unreachable.map(i => places[i].name).join(', ')}.
            Rute dihitung tanpa sekolah itu.
          </div>
        )}

        <div className="sec">
          <div className="row">
            <label>
              <input type="checkbox" checked={showNaive} onChange={e => setShowNaive(e.target.checked)} />
              Tampilkan urutan asal
            </label>
            <button className="small" onClick={() => setReplay(r => r + 1)}>Putar ulang</button>
          </div>
        </div>

        <div className="sec">
          <p className="lbl manifest-title">Urutan kunjungan</p>
          <div className="stops">
            <button className="stop" onClick={() => select(0)}>
              <span className="badge kitchen">D</span>
              <span className="name">{places[0].name}</span>
            </button>
            {route.slice(1, -1).map((idx, k) => (
              <button key={idx} className={'stop' + (active === idx ? ' active' : '')} onClick={() => select(idx)}>
                <span className="badge" style={{ background: legColor(k, totalLegs) }}>{k + 1}</span>
                <span className="name">{places[idx].name}</span>
                <span className="leg">+ {fmt(objective, matrix[route[k]][idx])}</span>
              </button>
            ))}
            <div className="stop" style={{ cursor: 'default' }}>
              <span className="badge kitchen" style={{ background: legColor(totalLegs - 1, totalLegs) }}>D</span>
              <span className="name">Kembali ke dapur</span>
              <span className="leg">
                + {fmt(objective, matrix[route[route.length - 2]][0])}
              </span>
            </div>
            {unreachable.map(i => (
              <button key={'u' + i} className="stop" onClick={() => select(i)}>
                <span className="badge" style={{ background: '#6b7280' }}>×</span>
                <span className="name">{places[i].name}</span>
                <span className="leg">tidak terjangkau</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="map-wrap">
      <MapContainer
        center={[places[0].lat, places[0].lng]}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <FlyTo target={flyTarget} />
        <ClickHandler active={mapMode !== 'none'} onClick={onMapClick} />

        {mode === 'normal' && showNaive && (
          <Polyline
            positions={current.naiveLine}
            pathOptions={{ color: '#666', weight: 3, dashArray: '6 8', opacity: 0.8 }}
          />
        )}

        {legParts.map((p, k) => (
          <Polyline key={'c' + k} positions={p.points} pathOptions={{ color: '#fff', weight: 9, opacity: 0.9 }} />
        ))}
        {legParts.map((p, k) => (
          <Polyline key={'l' + k} positions={p.points} pathOptions={{ color: p.color, weight: 5 }} />
        ))}

        {/* Palang jalan: garis melintang merah-putih di ruas yang ditutup */}
        {blockages.map((b, k) => (
          <Polyline key={'bo' + b.id} positions={b.ends} pathOptions={{ color: '#1f2937', weight: 12, lineCap: 'butt' }}>
            <Tooltip>Blokade {k + 1}</Tooltip>
          </Polyline>
        ))}
        {blockages.map(b => (
          <Polyline key={'br' + b.id} positions={b.ends} pathOptions={{ color: '#dc2626', weight: 8, lineCap: 'butt', interactive: false }} />
        ))}
        {blockages.map(b => (
          <Polyline key={'bw' + b.id} positions={b.ends} pathOptions={{ color: '#fff', weight: 8, dashArray: '7 7', lineCap: 'butt', interactive: false }} />
        ))}

        {mode !== 'normal' && viz && (
          <>
            <FitBounds bounds={viz.bounds} />
            <SearchLayer
              coords={viz.orderCoords}
              parents={viz.parentCoords}
              step={dijkStep}
              color={mode === 'astar' ? '#a855f7' : '#06b6d4'}
            />
            {dijkStep >= viz.orderCoords.length && (
              <>
                {viz.routes.map(
                  (r, k) =>
                    r.found && (
                      <Polyline key={'dc' + k} positions={r.latlngs} pathOptions={{ color: '#fff', weight: 10, opacity: 0.95 }} />
                    )
                )}
                {viz.routes.map(
                  (r, k) =>
                    r.found && (
                      <Polyline key={'dr' + k} positions={r.latlngs} pathOptions={{ color: djColor(k), weight: 6 }} />
                    )
                )}
              </>
            )}
          </>
        )}

        {places.map((p, i) => {
          const pos = route.indexOf(i);
          let icon;
          if (mode !== 'normal') {
            icon =
              i === 0
                ? pin('D', 'kitchen', false)
                : targets.includes(i)
                  ? pin(targets.indexOf(i) + 1, 'school', false, djColor(targets.indexOf(i)))
                  : pin('', 'school', false, '#6b7280');
          } else if (i === 0) icon = pin('D', 'kitchen', active === 0);
          else if (pos === -1) icon = pin('×', 'school', active === i, '#6b7280');
          else icon = pin(pos, 'school', active === i, legColor(pos - 1, totalLegs));
          return (
            <Marker
              key={i}
              position={[p.lat, p.lng]}
              icon={icon}
              draggable={mode === 'normal'}
              eventHandlers={{
                click: () => setActive(i),
                dragend: e => moveLocation(i, e.target.getLatLng()),
              }}
            >
              <Tooltip>{p.name}</Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      </div>

      <aside className="side-right">
      <div className="side-card">
        <div className="dock-head">
          <b>Perbandingan algoritma</b>
          <span>
            {objective === 'dist' ? 'Jarak' : 'Waktu'} · {targets.length} tujuan
          </span>
        </div>
        <div className="dock-row head">
          <span />
          <span>Simpul</span>
          <span>ms</span>
        </div>
        <div className="dock-row">
          <span>Dijkstra, sekali jalan</span>
          <span>{dSnap ? num(dSnap.visitedS) : 0}</span>
          <span>{dSnap ? dSnap.msS.toFixed(2) : '0.00'}</span>
        </div>
        <div className="dock-row">
          <span>Dijkstra, tiap tujuan</span>
          <span>{dSnap ? num(dSnap.visitedD) : 0}</span>
          <span>{dSnap ? dSnap.msD.toFixed(2) : '0.00'}</span>
        </div>
        <div className="dock-row">
          <span>A* (w {astarW}), tiap tujuan</span>
          <span>{aSnap ? num(aSnap.visitedA) : 0}</span>
          <span>{aSnap ? aSnap.msA.toFixed(2) : '0.00'}</span>
        </div>
        <p className="dock-note">
          {dSnap && aSnap
            ? `Simpul A* ${reduction(aSnap.visitedA, dSnap.visitedS)} dibanding Dijkstra sekali jalan dan ${reduction(
                aSnap.visitedA,
                dSnap.visitedD
              )} dibanding Dijkstra tiap tujuan. ${
                aSnap.costGap < 1e-9
                  ? 'Biaya jalur A* sama dengan Dijkstra.'
                  : `Jalur A* ${(aSnap.costGap * 100).toFixed(1)}% lebih panjang dari Dijkstra.`
              }`
            : 'Jalankan Dijkstra dan A* (tombol di panel) untuk mengisi perbandingan.'}
        </p>
      </div>

          {ex && graphStats && (
            <details className="explain" open>
              <summary>Cara perhitungannya</summary>
              <p className="ex-formula">{mode === 'astar' ? 'prioritas = g + w × h' : 'prioritas = g'}</p>
              <p className="note">
                <b>g</b> = biaya nyata dari dapur sampai simpul itu.
                {mode === 'astar' && (
                  <>
                    {' '}<b>h</b> = tebakan sisa biaya ke tujuan, yaitu jarak lurus
                    {objective === 'time' ? ` dibagi kecepatan tertinggi (${ex.vmaxKmh.toFixed(0)} km/jam)` : ''}.{' '}
                    <b>w</b> = bobot (sekarang {astarW}).
                  </>
                )}{' '}
                Simpul dengan prioritas terkecil diproses lebih dulu.
              </p>
              {ex.ex ? (
                <div className="ex-box">
                  <span className="lbl">
                    Contoh: simpul ke-{ex.ex.k + 1} dari {ex.ex.n} pada jalur ke {places[ex.place].name}
                  </span>
                  <div>g = {fmtN(objective, ex.ex.g)}</div>
                  {mode === 'astar' ? (
                    <>
                      <div>h = {fmtN(objective, ex.ex.h)}</div>
                      <div>
                        prioritas = {fmtN(objective, ex.ex.g)} + {astarW} × {fmtN(objective, ex.ex.h)} ={' '}
                        <b>{fmtN(objective, ex.ex.g + astarW * ex.ex.h)}</b>
                      </div>
                      <p className="note">
                        Sisa biaya sebenarnya = {fmtN(objective, ex.ex.remaining)}. h{' '}
                        {ex.ex.h <= ex.ex.remaining + 1e-6 ? '≤' : '>'} sisa, jadi tebakannya{' '}
                        {ex.ex.h <= ex.ex.remaining + 1e-6 ? 'tidak berlebihan' : 'berlebihan'}.
                      </p>
                    </>
                  ) : (
                    <>
                      <div>
                        prioritas = <b>{fmtN(objective, ex.ex.g)}</b>
                      </div>
                      <p className="note">
                        A* akan menambahkan h = {fmtN(objective, ex.ex.h)} di sini, sehingga prioritasnya{' '}
                        {fmtN(objective, ex.ex.g + ex.ex.h)}.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <p className="note">Jalur terlalu pendek untuk dijadikan contoh.</p>
              )}
              <div className="ex-box">
                <span className="lbl">
                  Ukuran dan kerja pencarian{mode === 'astar' && targets.length > 1 ? ' (jumlah semua tujuan)' : ''}
                </span>
                <div className="ex-row"><span>Graph</span><span>{num(graphStats.V)} simpul, {num(graphStats.E)} ruas</span></div>
                <div className="ex-row"><span>Simpul diproses</span><span>{num(ex.stats.visited)}</span></div>
                <div className="ex-row"><span>Ruas diperiksa</span><span>{num(ex.stats.examined)}</span></div>
                <div className="ex-row"><span>Biaya diperbarui</span><span>{num(ex.stats.relaxed)}</span></div>
                <div className="ex-row">
                  <span>Operasi antrian</span>
                  <span>{num(ex.stats.pushes + ex.stats.pops)} (masuk {num(ex.stats.pushes)}, keluar {num(ex.stats.pops)})</span>
                </div>
                <p className="note">
                  Ordo O((V + E) log V). Nilai rumusnya: ({num(graphStats.V)} + {num(graphStats.E)}) × log₂({num(graphStats.V)}) ≈{' '}
                  {num(Math.round((graphStats.V + graphStats.E) * Math.log2(Math.max(2, graphStats.V))))}. Ini batas atas
                  untuk menjelajah seluruh graph, bukan hitungan persis.
                  {mode === 'astar' ? ' A* memakai ordo yang sama di kasus terburuk, tapi heuristik membuat kerja sebenarnya jauh lebih kecil.' : ''}
                </p>
              </div>
            </details>
          )}
        {!(ex && graphStats) && (
          <p className="note">Pilih Dijkstra atau A* di panel kiri untuk melihat cara perhitungannya.</p>
        )}
      </aside>
    </div>
  );
}
