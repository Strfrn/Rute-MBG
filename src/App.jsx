import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import { buildGraph } from './algorithms/graph.js';
import { largestComponent, snapPoint } from './algorithms/snap.js';
import { buildMatrix } from './algorithms/matrix.js';
import { bruteForce, naiveRoute, routeCost } from './algorithms/route.js';
import { routeToCoords } from './algorithms/roadPath.js';

const COLORS = { dist: '#0f766e', time: '#c2410c' };

function fmt(key, v) {
  if (key === 'dist') return v >= 1000 ? (v / 1000).toFixed(2) + ' km' : Math.round(v) + ' m';
  return (v / 60).toFixed(1) + ' menit';
}

function pin(label, kind, active) {
  return L.divIcon({
    className: '',
    html: `<div class="pin ${kind}${active ? ' active' : ''}">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// Membuat peta terbang ke lokasi yang diklik
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 16, { duration: 0.8 });
  }, [target, map]);
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

  useEffect(() => {
    Promise.all([
      fetch('/data/data.json').then(r => r.json()),
      fetch('/data/roads.json').then(r => r.json()),
    ]).then(([data, roads]) => setRaw({ data, roads }));
  }, []);

  const plan = useMemo(() => {
    if (!raw) return null;
    const { data, roads } = raw;
    const g = buildGraph(roads);
    const main = largestComponent(g.adj);
    const places = [data.kitchen, ...data.schools];
    const nodes = places.map(p => snapPoint(p, g.coords, main).nodeId);

    const result = {};
    for (const key of ['dist', 'time']) {
      const matrix = buildMatrix(g.adj, nodes, key);
      const route = bruteForce(matrix);
      const naive = naiveRoute(places.length);
      result[key] = {
        matrix,
        route,
        cost: routeCost(matrix, route),
        line: routeToCoords(g.adj, g.coords, nodes, route, key),
        naiveCost: routeCost(matrix, naive),
        naiveLine: routeToCoords(g.adj, g.coords, nodes, naive, key),
      };
    }
    return { places, result };
  }, [raw]);

  const current = plan ? plan.result[objective] : null;

  // Animasi menggambar garis rute
  useEffect(() => {
    if (!current) return;
    const total = current.line.length;
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

  const { places } = plan;
  const { route, cost, naiveCost, matrix } = current;
  const saved = (((naiveCost - cost) / naiveCost) * 100).toFixed(1);

  const select = i => {
    setActive(i);
    setFlyTarget([places[i].lat, places[i].lng]);
  };

  return (
    <div className="layout">
      <aside className="panel">
        <div>
          <h1>Rute pengantaran MBG</h1>
          <p className="sub">Dari {places[0].name} ke {places.length - 1} sekolah</p>
        </div>

        <div className="toggle">
          <button className={objective === 'dist' ? 'on' : ''} onClick={() => setObjective('dist')}>
            Jarak terpendek
          </button>
          <button className={objective === 'time' ? 'on' : ''} onClick={() => setObjective('time')}>
            Waktu tercepat
          </button>
        </div>

        <div className="stats">
          <div className="stat">
            <b>{fmt(objective, cost)}</b>
            <span>Rute terbaik</span>
          </div>
          <div className="stat">
            <b>{fmt(objective, naiveCost)}</b>
            <span>Urutan asal</span>
          </div>
                   <div className="stat wide">
            <b>
              Hemat {objective === 'dist' ? 'jarak' : 'waktu'} {saved}%
            </b>
            <span>
              {fmt(objective, naiveCost - cost)} lebih {objective === 'dist' ? 'pendek' : 'cepat'} dari urutan asal
            </span>
          </div>
        </div>

        <div className="row">
          <label>
            <input type="checkbox" checked={showNaive} onChange={e => setShowNaive(e.target.checked)} />{' '}
            Tampilkan urutan asal
          </label>
          <button onClick={() => setReplay(r => r + 1)}>Putar ulang</button>
        </div>

        <div className="stops">
          <button className="stop" onClick={() => select(0)}>
            <span className="badge kitchen">D</span>
            <span className="name">{places[0].name}</span>
          </button>
          {route.slice(1, -1).map((idx, k) => (
            <button key={idx} className={'stop' + (active === idx ? ' active' : '')} onClick={() => select(idx)}>
              <span className="badge">{k + 1}</span>
              <span className="name">{places[idx].name}</span>
              <span className="leg">+ {fmt(objective, matrix[route[k]][idx])}</span>
            </button>
          ))}
          <div className="stop" style={{ cursor: 'default' }}>
            <span className="badge kitchen">D</span>
            <span className="name">Kembali ke dapur</span>
            <span className="leg">
              + {fmt(objective, matrix[route[route.length - 2]][0])}
            </span>
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

        {showNaive && (
          <Polyline
            positions={current.naiveLine}
            pathOptions={{ color: '#888', weight: 3, dashArray: '6 8', opacity: 0.8 }}
          />
        )}

        <Polyline positions={current.line.slice(0, drawn)} pathOptions={{ color: '#fff', weight: 9, opacity: 0.9 }} />
        <Polyline positions={current.line.slice(0, drawn)} pathOptions={{ color: COLORS[objective], weight: 5 }} />

        {places.map((p, i) => (
          <Marker
            key={i}
            position={[p.lat, p.lng]}
            icon={
              i === 0
                ? pin('D', 'kitchen', active === 0)
                : pin(route.indexOf(i), 'school', active === i)
            }
            eventHandlers={{ click: () => setActive(i) }}
          >
            <Tooltip>{p.name}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}