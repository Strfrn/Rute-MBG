import fs from 'fs';
import { buildGraph } from './graph.js';
import { largestComponent, snapPoint } from './snap.js';
import { buildMatrix } from './matrix.js';

const osm = JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('public/data/data.json', 'utf8'));

const g = buildGraph(osm);
const main = largestComponent(g.adj);

const places = [data.kitchen, ...data.schools];
const nodes = places.map(p => snapPoint(p, g.coords, main).nodeId);

const dist = buildMatrix(g.adj, nodes, 'dist');
console.log('Tabel jarak (meter):');
dist.forEach((row, i) => {
  console.log(places[i].name.padEnd(26), row.map(v => String(Math.round(v)).padStart(6)).join(''));
});