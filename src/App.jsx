import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer, TileLayer, Marker, Polyline, Circle, Tooltip, useMap, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import { buildGraph } from './algorithms/graph.js';
import { largestComponent, snapPoint } from './algorithms/snap.js';
import { buildMatrix } from './algorithms/matrix.js';
import { bruteForce, naiveRoute, routeCost } from './algorithms/route.js';
import { routeToCoords, routeToLegs } from './algorithms/roadPath.js';
import { applyBlockages } from './algorithms/blockage.js';
import { dijkstra, dijkstraTrace } from './algorithms/dijkstra.js';

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

// Warna jalur hasil Dijkstra (dibuat beda dari warna pencarian)
const DJ_COLORS = [
  '#e11d48', '#f97316', '#16a34a', '#111827',
  '#b45309', '#be185d', '#4d7c0f', '#7f1d1d',
];
function djColor(k) {
  return k < DJ_COLORS.length ? DJ_COLORS[k] : `hsl(${(k * 137.5) % 360} 70% 40%)`;
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
function SearchLayer({ coords, parents, step }) {
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
      // Satu warna untuk semua garis dan titik pencarian
      const color = '#06b6d4';
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
  }, [step, coords, parents]);

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
  const [raw, setRaw] = useState(null);
  const [objective, setObjective] = useState('dist');
  const [showNaive, setShowNaive] = useState(true);
  const [active, setActive] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [drawn, setDrawn] = useState(0);
  const [replay, setReplay] = useState(0);
  const [blockages, setBlockages] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [radius, setRadius] = useState(40);
  const [mode, setMode] = useState('normal'); // 'normal' atau 'dijkstra'
  const [dijkTargets, setDijkTargets] = useState(null); // null = pakai 3 sekolah pertama pada rute
  const [dijkStep, setDijkStep] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch('/data/data.json').then(r => r.json()),
      fetch('/data/roads.json').then(r => r.json()),
    ]).then(([data, roads]) => setRaw({ data, roads }));
  }, []);

  // Dihitung sekali: graph, tempat, dan hasil snapping
  const base = useMemo(() => {
    if (!raw) return null;
    const g = buildGraph(raw.roads);
    const main = largestComponent(g.adj);
    const places = [raw.data.kitchen, ...raw.data.schools];
    const nodes = places.map(p => snapPoint(p, g.coords, main).nodeId);
    return { g, places, nodes };
  }, [raw]);

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

  // Satu pencarian Dijkstra untuk semua tujuan, lalu waktunya diukur (rata-rata 20 kali)
  const dijk = useMemo(() => {
    if (mode !== 'dijkstra' || !base || !adjNow) return null;
    const valid = targets.filter(t => t > 0 && t < base.nodes.length);
    if (!valid.length) return null;
    const from = base.nodes[0];
    const toNodes = valid.map(t => base.nodes[t]);
    const t = dijkstraTrace(adjNow, from, toNodes, objective);

    dijkstra(adjNow, from, objective, toNodes); // pemanasan
    const RUNS = 20;
    const t0 = performance.now();
    for (let i = 0; i < RUNS; i++) dijkstra(adjNow, from, objective, toNodes);
    const ms = (performance.now() - t0) / RUNS;

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
      ms,
      routes,
      bounds,
      orderCoords: t.order.map(co),
      parentCoords: t.parent.map(p => (p === null ? null : co(p))),
    };
  }, [mode, base, adjNow, targets, objective]);

  // Animasi pencarian Dijkstra
  useEffect(() => {
    if (!dijk) return;
    const total = dijk.orderCoords.length;
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
  }, [dijk, replay]);

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

  const { places } = base;
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

  const addBlockage = ll =>
    setBlockages(list => [
      ...list,
      { id: Date.now() + Math.random(), lat: ll.lat, lng: ll.lng, radius },
    ]);
  const toggleTarget = i => {
    if (targets.includes(i)) {
      if (targets.length > 1) setDijkTargets(targets.filter(x => x !== i));
    } else {
      setDijkTargets([...targets, i]);
    }
  };
  const removeBlockage = id => setBlockages(list => list.filter(b => b.id !== id));

  return (
    <div className={'layout' + (mode === 'dijkstra' ? ' dj-mode' : '')}>
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
            {mode === 'dijkstra' && dijk && (
              <span className="dj-ms">
                <b>{dijk.ms.toFixed(2)}</b> ms
              </span>
            )}
          </div>
          {mode === 'dijkstra' && dijk && (
            <div className="dj-info">
              <span className="lbl">Tujuan (boleh lebih dari satu)</span>
              <div className="dj-targets">
                {places.slice(1).map((p, k) => {
                  const i = k + 1;
                  const on = targets.includes(i);
                  const r = dijk.routes.find(x => x.place === i);
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
                {dijk.orderCoords.length.toLocaleString('id-ID')} simpul dikunjungi untuk {targets.length} tujuan
                sekaligus. Waktu = rata-rata 20 kali pencarian, tanpa animasi.
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
          <button className={'btn' + (addMode ? ' on' : '')} onClick={() => setAddMode(m => !m)}>
            {addMode ? 'Selesai menambah' : 'Tambah blokade (klik peta)'}
          </button>
          <label className="radius">
            Radius blokade berikutnya: {radius} m
            <input
              type="range" min="15" max="150" step="5" value={radius}
              onChange={e => setRadius(Number(e.target.value))}
            />
          </label>

          {blockages.length === 0 && (
            <p className="note">Belum ada blokade. Aktifkan tombol di atas, lalu klik di jalan pada peta.</p>
          )}

          {blockages.map((b, k) => (
            <div key={b.id} className="hz-item">
              <span>Blokade {k + 1} · {b.radius} m</span>
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
        <ClickHandler active={addMode} onClick={addBlockage} />

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

        {blockages.map((b, k) => (
          <Circle
            key={b.id}
            center={[b.lat, b.lng]}
            radius={b.radius}
            pathOptions={{ color: '#dc2626', weight: 3, fillColor: '#dc2626', fillOpacity: 0.25 }}
          >
            <Tooltip>Blokade {k + 1}</Tooltip>
          </Circle>
        ))}

        {mode === 'dijkstra' && dijk && (
          <>
            <FitBounds bounds={dijk.bounds} />
            <SearchLayer coords={dijk.orderCoords} parents={dijk.parentCoords} step={dijkStep} />
            {dijkStep >= dijk.orderCoords.length && (
              <>
                {dijk.routes.map(
                  (r, k) =>
                    r.found && (
                      <Polyline key={'dc' + k} positions={r.latlngs} pathOptions={{ color: '#fff', weight: 10, opacity: 0.95 }} />
                    )
                )}
                {dijk.routes.map(
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
          if (mode === 'dijkstra') {
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
              eventHandlers={{ click: () => setActive(i) }}
            >
              <Tooltip>{p.name}</Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
