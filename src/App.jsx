import { useEffect, useMemo, useState } from 'react';
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
  const saved = naiveCost > 0 ? (((naiveCost - cost) / naiveCost) * 100).toFixed(1) : '0.0';
  const barWidth = naiveCost > 0 ? Math.max(4, (cost / naiveCost) * 100) : 100;
  const baseCost = baseline.result[objective].cost;
  const delta = cost - baseCost;
  const word = objective === 'dist' ? 'jarak' : 'waktu';

  // Potong tiap perjalanan sesuai progres animasi, dan beri warna
  const totalLegs = current.legs.length;
  let offset = 0;
  const legParts = current.legs.map((leg, k) => {
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
  const removeBlockage = id => setBlockages(list => list.filter(b => b.id !== id));

  return (
    <div className="layout">
      <aside className="panel">
        <header className="brand">
          <span className="eyebrow">MBG · Dispatch</span>
          <h1>Rute pengantaran</h1>
          <p className="sub">
            <b>{places[0].name}</b> → {places.length - 1} sekolah
          </p>
        </header>

        <div className="sec">
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
          <div className="bar" title="Rute terbaik dibanding urutan asal">
            <i style={{ width: barWidth + '%' }} />
          </div>
          <div className="cmp">
            <span>urutan asal {fmt(objective, naiveCost)}</span>
            <span className="save">
              Hemat {word} {saved}%
            </span>
          </div>
          <p className="gain">
            {fmt(objective, naiveCost - cost)} lebih {objective === 'dist' ? 'pendek' : 'cepat'} dari urutan asal
          </p>
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
            RADIUS BLOKADE BERIKUTNYA · {radius} M
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

        {showNaive && (
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

        {places.map((p, i) => {
          const pos = route.indexOf(i);
          let icon;
          if (i === 0) icon = pin('D', 'kitchen', active === 0);
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
