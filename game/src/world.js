import * as THREE from 'three';
import { PALETTE as P, createMaterials, material, unlit, skyTexture, signTexture } from './palette.js';

// Metres; north is -Z. Positions denote feet, including the elevated nodes.
export const bounds = Object.freeze({ minX: -45, maxX: 45, minZ: -35, maxZ: 35 });
export const sites = {
  A: { id: 'A', name: 'Tower A', center: new THREE.Vector3(25, 0, -23), radius: 4.6 },
  B: { id: 'B', name: 'Battery Hall B', center: new THREE.Vector3(28, 0, 23), radius: 4.4 },
};
export const spawns = {
  solstice: [-4, -2, 0, 2, 4].map(z => new THREE.Vector3(-39, 0, z)),
  umbra: [-4, -2, 0, 2, 4].map(z => new THREE.Vector3(40, 0, z)),
};
export const colliders = [];
export const graph = {};
function node(id, x, z, lane, site = null, hold = false, y = 0) {
  graph[id] = { id, position: new THREE.Vector3(x, y, z), lane, site, hold, edges: [] };
}
for (const a of [
  ['SpawnW',-39,0,'spawn'], ['YardGate',-31,4,'mid'], ['YardN',-34,-8,'A'],
  ['NorthW',-32,-18,'A'], ['LinkW',-20,-21,'A'], ['LinkA',-3,-21,'A'],
  ['LinkTurn',6,-28,'A'], ['TowerEntry',15,-27,'A','A',true],
  ['TowerWest',20,-23,'A','A',true], ['Tower',25,-23,'A','A'],
  ['TowerEast',36,-20,'A','A',true], ['EastN',40,-13,'A'], ['SpawnE',40,0,'spawn'],
  ['EastS',40,10,'B'], ['HallEntryN',32,10,'B','B',true], ['HallNorth',32,17,'B','B'],
  ['Hall',28,23,'B','B'], ['HallWest',22,20,'B','B'], ['HallEntryW',15,20,'B','B',true],
  ['VentE',15,27,'B'], ['VentMid',0,27,'B'], ['VentW',-15,27,'B'],
  ['SouthW',-25,23,'B'], ['YardS',-34,15,'B'], ['CourtW',-23,3,'mid'],
  ['CourtNW',-18,-12,'mid',null,true], ['CourtN',0,-13,'mid'],
  ['CourtNE',17,-12,'mid',null,true], ['CourtE',21,3,'mid'],
  ['CourtSE',15,14,'mid',null,true], ['CourtS',0,17,'mid'],
  ['CourtSW',-18,14,'mid',null,true], ['CourtTurnW',-19,7,'mid'],
  ['CourtMidW',-9,3,'mid'], ['CourtMid',3,3,'mid'], ['CourtTurnE',9,-3,'mid'],
  ['StairW',-19,0,'gantry'], ['StairTopW',-11,0,'gantry',null,false,4.4],
  ['Gantry',0,0,'gantry',null,true,4.4], ['StairTopE',11,0,'gantry',null,false,4.4],
  ['StairE',19,0,'gantry'],
]) node(...a);
function connect(chain) {
  const ids = chain.split(' ');
  for (let i = 1; i < ids.length; i++) {
    graph[ids[i - 1]].edges.push(ids[i]);
    graph[ids[i]].edges.push(ids[i - 1]);
  }
}
for (const chain of [
  'SpawnW YardN NorthW LinkW LinkA LinkTurn TowerEntry TowerWest Tower TowerEast EastN SpawnE',
  'SpawnW YardS SouthW VentW VentMid VentE HallEntryW HallWest Hall HallNorth HallEntryN EastS SpawnE',
  'SpawnW YardGate CourtW CourtTurnW CourtMidW CourtMid CourtTurnE CourtE SpawnE',
  'CourtW CourtNW CourtN CourtNE EastN', 'CourtNW LinkW', 'CourtN LinkA',
  'CourtNE TowerEntry', 'CourtW CourtSW CourtS CourtSE CourtE',
  'CourtSW SouthW', 'CourtS VentMid', 'CourtSE HallEntryW', 'CourtE HallEntryN',
  'CourtW StairW StairTopW Gantry StairTopE StairE CourtE',
]) connect(chain);
const nodes = Object.values(graph);
nodes.forEach((n, i) => { n.index = i; });
export const holdSpots = nodes.filter(n => n.hold);
const queue = new Int16Array(nodes.length), parent = new Int16Array(nodes.length);
const visited = new Uint8Array(nodes.length);

export function nearestNode(position, lane = null) {
  let best = null, distance = Infinity;
  for (const n of nodes) {
    if (lane && n.lane !== lane) continue;
    const d = n.position.distanceToSquared(position);
    if (d < distance) { best = n; distance = d; }
  }
  return best;
}

// Routing is occasional; bots can pass their existing path array to avoid allocation.
export function findPath(from, to, out = []) {
  out.length = 0;
  const start = typeof from === 'string' ? graph[from] : from?.id ? graph[from.id] : from ? nearestNode(from) : null;
  const end = typeof to === 'string' ? graph[to] : to?.id ? graph[to.id] : to ? nearestNode(to) : null;
  if (!start || !end) return out;
  visited.fill(0); parent.fill(-1);
  let head = 0, tail = 1;
  queue[0] = start.index; visited[start.index] = 1;
  while (head < tail) {
    const n = nodes[queue[head++]];
    if (n === end) break;
    for (const id of n.edges) {
      const next = graph[id].index;
      if (visited[next]) continue;
      visited[next] = 1; parent[next] = n.index; queue[tail++] = next;
    }
  }
  if (!visited[end.index]) return out;
  for (let i = end.index; i >= 0; i = parent[i]) out.push(nodes[i]);
  return out.reverse();
}

export function siteAt(position) {
  for (const id in sites) {
    const s = sites[id], dx = position.x - s.center.x, dz = position.z - s.center.z;
    if (Math.abs(position.y - s.center.y) < 1.5 && dx * dx + dz * dz <= s.radius * s.radius) return s;
  }
  return null;
}

// Slabs return a fraction of the finite segment, or Infinity. Starts inside hit 0.
export function segmentAABB(a, b, box) {
  let near = 0, far = 1;
  for (let axis = 0; axis < 3; axis++) {
    const k = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
    const d = b[k] - a[k], low = box.min[k], high = box.max[k];
    if (Math.abs(d) < 1e-9) { if (a[k] < low || a[k] > high) return Infinity; }
    else {
      let t0 = (low - a[k]) / d, t1 = (high - a[k]) / d;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      near = Math.max(near, t0); far = Math.min(far, t1);
      if (near > far) return Infinity;
    }
  }
  return near;
}

// Optional hit owns reusable point/normal Vector3s. Return value is t, never distance.
export function traceSegment(a, b, hit = null) {
  let nearest = Infinity, found = null;
  for (let i = 0; i < colliders.length; i++) {
    const t = segmentAABB(a, b, colliders[i]);
    if (t < nearest) { nearest = t; found = colliders[i]; }
  }
  if (hit) {
    hit.collider = found; hit.t = nearest;
    if (found && hit.point) {
      hit.point.copy(a).lerp(b, nearest);
      if (hit.normal) {
        const p = hit.point, lo = found.min, hi = found.max;
        hit.normal.set(0, 0, 0);
        if (Math.abs(p.x - lo.x) < 0.002) hit.normal.x = -1;
        else if (Math.abs(p.x - hi.x) < 0.002) hit.normal.x = 1;
        else if (Math.abs(p.y - lo.y) < 0.002) hit.normal.y = -1;
        else if (Math.abs(p.y - hi.y) < 0.002) hit.normal.y = 1;
        else hit.normal.z = Math.abs(p.z - lo.z) < Math.abs(p.z - hi.z) ? -1 : 1;
      }
    }
  }
  return nearest;
}
export function lineOfSight(a, b) { return traceSegment(a, b) === Infinity; }

const EPS = 0.001;
function overlapsXZ(x, z, r, b) {
  return x + r > b.min.x + EPS && x - r < b.max.x - EPS &&
    z + r > b.min.z + EPS && z - r < b.max.z - EPS;
}
function freeAt(x, y, z, radius, height) {
  for (const b of colliders) {
    if (overlapsXZ(x, z, radius, b) && y + height > b.min.y + EPS && y < b.max.y - EPS) return false;
  }
  return true;
}
export function collide(position, radius = 0.32, height = 1.75) {
  return !freeAt(position.x, position.y, position.z, radius, height);
}
export function groundHeight(position, radius = 0.32, maxDrop = 0.08) {
  let top = -Infinity;
  for (const b of colliders) {
    if (b.max.y <= position.y + EPS && position.y - b.max.y <= maxDrop &&
      b.max.y > top && overlapsXZ(position.x, position.z, radius, b)) top = b.max.y;
  }
  return top;
}
const motion = { grounded: false, hitX: false, hitY: false, hitZ: false, stepped: false };
function slideAxis(p, amount, axis, radius, height, step, canStep, out) {
  if (!amount) return;
  p[axis] += amount;
  for (const b of colliders) {
    if (!overlapsXZ(p.x, p.z, radius, b) || p.y + height <= b.min.y + EPS || p.y >= b.max.y - EPS) continue;
    const rise = b.max.y - p.y;
    if (canStep && rise > 0 && rise <= step + EPS && freeAt(p.x, b.max.y + EPS, p.z, radius, height)) {
      p.y = b.max.y + EPS; out.stepped = true;
    } else {
      p[axis] = amount > 0 ? Math.min(p[axis], b.min[axis] - radius - EPS)
        : Math.max(p[axis], b.max[axis] + radius + EPS);
      if (axis === 'x') out.hitX = true; else out.hitZ = true;
    }
  }
}

// Mutates feet position, never delta. Small substeps prevent thin-wall tunnelling.
// Pass an actor-owned result, or consume the shared result before the next move.
export function move(position, delta, radius = 0.32, height = 1.75, step = 0.26, out = motion) {
  out.grounded = out.hitX = out.hitY = out.hitZ = out.stepped = false;
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)) / 0.2));
  const dx = delta.x / count, dy = delta.y / count, dz = delta.z / count;
  for (let i = 0; i < count; i++) {
    const supported = groundHeight(position, radius, 0.035) !== -Infinity;
    const oldY = position.y;
    position.y += dy;
    for (const b of colliders) {
      if (!overlapsXZ(position.x, position.z, radius, b)) continue;
      if (dy < 0 && oldY >= b.max.y - EPS && position.y < b.max.y) {
        position.y = b.max.y; out.hitY = true;
      } else if (dy > 0 && oldY + height <= b.min.y + EPS && position.y + height > b.min.y) {
        position.y = b.min.y - height; out.hitY = true;
      }
    }
    const canStep = dy <= 0 && (supported || groundHeight(position, radius, 0.035) !== -Infinity);
    slideAxis(position, dx, 'x', radius, height, step, canStep, out);
    slideAxis(position, dz, 'z', radius, height, step, canStep, out);
    const top = dy <= 0 ? groundHeight(position, radius, canStep ? step + 0.035 : 0.025) : -Infinity;
    out.grounded = top !== -Infinity;
    if (out.grounded) position.y = top;
  }
  return out;
}

// One active yard: rebuild replaces the exported collider contents. No renderer,
// camera, animation loop or match state is owned here. Call dispose before rebuild.
export function createWorld(seed = 73021) {
  colliders.length = 0;
  const scene = new THREE.Scene(), yard = new THREE.Group(), m = createMaterials();
  yard.name = 'Helioworks Yard'; scene.add(yard);
  scene.background = new THREE.Color(P.skyHorizon);
  scene.fog = new THREE.Fog(P.fog, 85, 200);
  const fill = new THREE.HemisphereLight(0x8b9ac7, 0x9a4a20, 0.85);
  const sun = new THREE.DirectionalLight(P.glint, 2.2);
  sun.position.set(-38, 22, -52); sun.castShadow = false;
  scene.add(fill, sun);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(205, 32, 16),
    unlit(0xffffff, { map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  dome.name = 'Dusk sky'; dome.renderOrder = -10; scene.add(dome);
  const solarDisc = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 10), m.sun);
  solarDisc.position.set(-105, 32, -135); scene.add(solarDisc);
  const cube = new THREE.BoxGeometry(1, 1, 1), plane = new THREE.PlaneGeometry(1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  let rng = seed | 0 || 1;
  function rand() { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; }
  function add(geometry, mat, x, y, z, sx, sy, sz, tag, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = mesh.receiveShadow = false;
    yard.add(mesh);
    if (tag) {
      mesh.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(mesh); b.tag = tag;
      colliders.push(b);
    }
    return mesh;
  }
  function box(x, y, z, w, h, d, mat = m.wall, tag = 'wall', ry = 0, rx = 0, rz = 0) {
    return add(cube, mat, x, y, z, w, h, d, tag, rx, ry, rz);
  }
  function cyl(x, y, z, r, h, mat = m.steel, tag = 'pipe', rx = 0, rz = 0) {
    return add(cylinder, mat, x, y, z, r, h, r, tag, rx, 0, rz);
  }
  // Ground paint and trim contained within a solid hull are visual only.
  let paintLayer = 0;
  function paint(x, z, w, d, mat, y = 0.018) { return add(plane, mat, x, y + paintLayer++ * 0.00001, z, w, d, 1, null, -Math.PI / 2); }
  const road = material(0x8f6846), line = unlit(P.sandLight), shade = unlit(P.ink, { transparent: true, opacity: 0.16, depthWrite: false });
  function shadow(x, z, w, d) { paint(x + 0.6, z + 0.7, w, d, shade, 0.024); }
  function sign(text, x, y, z, w, h, ry = 0, options = {}, post = false) {
    const mat = unlit(0xffffff, { map: signTexture(text, options), side: THREE.DoubleSide });
    box(x, y, z, w + 0.12, h + 0.12, 0.12, m.steelDark, 'sign', ry);
    add(plane, mat, x + Math.sin(ry) * 0.067, y, z + Math.cos(ry) * 0.067, w, h, 1, null, 0, ry);
    if (post) box(x, y / 2, z, 0.14, y, 0.14, m.steel, 'signpost');
  }
  function crate(x, z, w = 2, h = 1.6, d = 2) {
    box(x, h / 2, z, w, h, d, m.copper, 'crate');
    for (const side of [-1, 1]) {
      box(x + side * w * 0.33, h / 2, z, 0.11, h + 0.02, d + 0.03, m.steelDark, null);
      box(x, h * 0.22, z + side * d / 2, w, 0.09, 0.04, m.steelDark, null);
    }
    shadow(x, z, w + 1, d + 0.7);
  }
  function barrier(x, z, w = 4, d = 0.9, h = 1.25, ry = 0) {
    box(x, h / 2, z, w, h, d, m.concrete, 'barrier', ry);
    box(x, h - 0.16, z, w + 0.02, 0.22, d + 0.02, m.hazard, null, ry);
  }
  function pipeStack(x, z, count = 3, length = 5, rx = Math.PI / 2) {
    for (let i = 0; i < count; i++) cyl(x + i * 0.85, 0.48, z, 0.4, length, m.copper, 'pipe stack', rx);
    if (count > 1) cyl(x + 0.42, 1.2, z, 0.4, length, m.steel, 'pipe stack', rx);
  }
  box(0, -0.3, 0, 90, 0.6, 70, m.sand, 'ground');
  for (const z of [-35, 35]) {
    box(0, 1.9, z, 91, 3.8, 1, m.wall, 'yard boundary');
    box(0, 3.85, z, 91.2, 0.2, 1.2, m.wallLight, null);
  }
  for (const x of [-45, 45]) box(x, 1.9, 0, 1, 3.8, 70, m.wall, 'yard boundary');
  paint(-37, 0, 14, 24, road); paint(0, 0, 47, 31, m.concrete);
  paint(-8, -23, 61, 5.5, road); paint(-23, 23, 28, 5.5, road);
  for (let x = -31; x < 18; x += 6) paint(x, -23, 2, 0.12, line);
  // Northern and southern partitions make the approach turn around their ends.
  box(-24, 1.8, -11, 12, 3.6, 1.2, m.wallLight, 'north service wall');
  box(-24, 1.8, 12, 12, 3.6, 1.2, m.wall, 'south service wall');
  box(7, 1.8, -20, 8, 3.6, 1.2, m.wall, 'Link turn');
  box(12, 1.8, -16, 1.2, 3.6, 7, m.wallLight, 'Tower approach');
  sign('LINK', -8, 2.8, -25, 3.2, 0.8, 0, { arrow: 'right', subtitle: 'Tower A / service road' }, true);
  sign('MIRROR COURT', -22, 3.1, -10.28, 6.4, 1.1, 0, { arrow: 'right' });
  sign('HELIOWORKS', -25, 2.5, 11.28, 7.5, 1.3, Math.PI, { subtitle: 'Solar thermal / yard operations' });
  // Service yard: a block-built van, supply stacks and west entry markings.
  box(-40, 1.15, -14, 3.4, 2.3, 6.2, m.white, 'service van');
  box(-40, 1.1, -10.4, 3.1, 2.2, 1.2, m.shadow, 'van cab');
  box(-40, 1.85, -9.77, 2.65, 0.55, 0.04, m.steelDark, null);
  for (const x of [-41.6,-38.4]) for (const z of [-15.7,-11.5]) cyl(x, 0.48, z, 0.48, 0.25, m.steelDark, 'van wheel', 0, Math.PI / 2);
  crate(-36, 9, 3, 2.1, 2.5); crate(-41, 10, 2, 1.4, 2);
  crate(-34, -27, 3, 2.3, 3); barrier(-30, -4, 1.4, 4);
  sign('SOLSTICE', -44.3, 2.8, 0, 6, 1.2, Math.PI / 2, { accent: P.solstice, subtitle: 'West service yard' });
  // Substation fence panels leave north/south exits open along x=40.
  for (const z of [-8,8]) for (const x of [35.7,43.5]) {
    box(x, 1.35, z, 2.8, 2.7, 0.16, m.steel, 'substation fence');
    for (let s = -1; s <= 1; s++) box(x + s, 2.85, z, 0.08, 0.35, 0.08, m.steelDark, 'fence spike');
  }
  for (const z of [-3,3]) {
    box(43, 1, z, 2, 2, 2.5, m.shadow, 'transformer');
    for (let i = 0; i < 5; i++) box(42.3 + i * 0.3, 2.25, z, 0.12, 0.5, 1.8, m.steel, 'cooling fin');
  }
  sign('UMBRA', 44.3, 2.8, 0, 5, 1, -Math.PI / 2, { accent: P.umbra, subtitle: 'East substation' });
  // Tower A: a receiver silhouette above a clear charge pad at the west base.
  paint(26, -23, 16, 17, road);
  cyl(31, 0.6, -26, 3, 1.2, m.concrete, 'tower footing');
  cyl(31, 12, -26, 1.8, 23, m.wallLight, 'solar tower');
  for (const y of [3,10,18,22]) cyl(31, y, -26, 2, 0.45, m.steel, 'tower collar');
  cyl(31, 24, -26, 2.25, 2.5, m.receiver, 'receiver');
  cyl(31, 25.5, -26, 2.7, 0.4, m.steelDark, 'receiver cap');
  for (const x of [18,24,30]) box(x, 0.55, -32, 0.22, 1.1, 0.7, m.steel, 'pipe support');
  cyl(24, 1.1, -32, 0.3, 13, m.copper, 'tower feed pipe', 0, Math.PI / 2);
  for (const [x,z] of [[17,-32],[38,-29],[29,-13]]) {
    cyl(x, 1, z, 0.16, 2, m.steel, 'dish mast');
    add(new THREE.ConeGeometry(2.1, 0.65, 12, 1, true), m.mirror, x, 2.3, z, 1, 1, 1, 'reflector dish', 0.32);
    shadow(x, z, 4.5, 3);
  }
  function siteMark(site) {
    const c = site.center, r = site.radius;
    add(new THREE.RingGeometry(r - 0.15, r, 48), m.glint, c.x, 0.035, c.z, 1, 1, 1, null, -Math.PI / 2);
    for (const dx of [-1,1]) paint(c.x + dx * (r - 0.5), c.z, 0.25, 1.1, m.hazard, 0.04);
    paint(c.x, c.z, 0.12, 1.1, line, 0.04); paint(c.x, c.z, 1.1, 0.12, line, 0.04);
  }
  siteMark(sites.A);
  sign('TOWER A', 31, 5, -23.9, 5.8, 1.5, 0, { subtitle: 'Receiver 01 / charge site' });
  sign('HELIOWORKS', 31, 12, -24.1, 5, 1.1, 0);
  sign('TOWER A', 19, 3.1, -30, 5, 1.2, 0, { arrow: 'right' }, true);
  sign('DANGER — CHARGE ZONE', 26, 1.3, -30, 5.5, 0.75, 0, { accent: P.hazard }, true);
  barrier(20, -18, 4); crate(36, -24, 2, 1.7, 2);
  // Offset heliostats leave distinct crossings and pockets of hard cover.
  for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
    const x = -15 + col * 8 + row * 3, z = row ? 8 : -8;
    cyl(x, 0.8, z, 0.13, 1.6, m.steel, 'mirror post');
    box(x, 1.75, z, 4.2, 0.16, 2.7, m.steelDark, 'heliostat frame', row ? -0.12 : 0.12, 0.42);
    box(x, 1.84, z, 4, 0.035, 2.5, m.mirror, 'mirror face', row ? -0.12 : 0.12, 0.42);
    shadow(x, z, 4.8, 2.7);
  }
  barrier(-15, 0, 2.5, 7); barrier(7, 4, 2.5, 5, 1.8);
  crate(-23, -6, 2.5, 1.7, 2); crate(22, -8, 2.3, 2.2, 2);
  barrier(-9, 15, 4); pipeStack(8, 18, 2, 4);
  sign('MIRROR COURT', 0, 5.8, 1.96, 6.8, 1, 0, { subtitle: 'Gantry above / keep clear' });
  // Gantry: 4.4m deck, 22m span, twenty 22cm steps at each end.
  box(0, 4.24, 0, 22, 0.32, 3.2, m.steel, 'gantry deck');
  for (const x of [-10,10]) for (const z of [-1.7,1.7]) box(x, 2.15, z, 0.28, 4.3, 0.28, m.steelDark, 'gantry leg');
  for (const z of [-1.8,1.8]) {
    box(0, 5.35, z, 22.4, 0.12, 0.12, m.copper, 'gantry rail');
    box(0, 4.85, z, 22.4, 0.08, 0.08, m.steel, 'gantry rail');
    for (let x = -11; x <= 11; x += 2.75) box(x, 4.85, z, 0.1, 1.1, 0.1, m.steel, 'rail post');
  }
  const stairAngle = Math.atan2(4.4, 8), railLength = Math.hypot(8, 4.4);
  for (const side of [-1,1]) {
    for (let i = 0; i < 20; i++) {
      const h = (i + 1) * 0.22, x = side * (18.8 - i * 0.4);
      box(x, h / 2, 0, 0.4, h, 3, m.steel, 'gantry step');
      box(x, h + 0.005, 0, 0.05, 0.01, 3, m.hazard, null);
    }
    for (const z of [-1.7,1.7]) box(side * 15, 3.25, z, railLength, 0.1, 0.1, m.copper, 'stair rail', 0, 0, -side * stairAngle);
  }
  // Battery Hall: west and north doors. Partial roof preserves interior views.
  paint(28, 23, 20, 18, road);
  box(18, 2.2, 15.5, 0.7, 4.4, 3, m.wallLight, 'Hall west wall');
  box(18, 2.2, 27.5, 0.7, 4.4, 9, m.wallLight, 'Hall west wall');
  box(18, 3.9, 20, 0.7, 1, 6, m.wallLight, 'Hall west lintel');
  box(23.5, 2.2, 14, 11, 4.4, 0.7, m.wall, 'Hall north wall');
  box(36.5, 2.2, 14, 3, 4.4, 0.7, m.wall, 'Hall north wall');
  box(32, 3.9, 14, 6, 1, 0.7, m.wall, 'Hall north lintel');
  box(38, 2.2, 23, 0.7, 4.4, 18, m.wall, 'Hall east wall');
  box(28, 2.2, 32, 20, 4.4, 0.7, m.wall, 'Hall south wall');
  box(28, 4.5, 29, 21, 0.25, 6.5, m.steelDark, 'Hall roof');
  for (const z of [14,23]) box(28, 4.5, z, 20.5, 0.25, 0.3, m.steel, 'Hall roof beam');
  const statusLight = unlit(P.solstice, { toneMapped: false });
  for (const [x,z,w,d] of [[24,28,1.4,5.4],[33,27,1.4,5.4],[23,16.2,2.2,2.8]]) {
    box(x, 1.65, z, w, 3.3, d, m.steelDark, 'battery rack');
    for (let level = 0; level < 4; level++) {
      box(x, 0.45 + level * 0.7, z, w + 0.03, 0.5, d - 0.15, m.shadow, null);
      box(x - w / 2 - 0.02, 0.55 + level * 0.7, z, 0.04, 0.07, d * 0.65, statusLight, null);
    }
  }
  siteMark(sites.B);
  sign('BATTERY HALL', 17.5, 5.35, 25, 9, 1.6, -Math.PI / 2, { subtitle: 'B / energy storage' });
  sign('BATTERY HALL', 24, 3, 13.57, 8, 1.2, Math.PI, { arrow: 'left' });
  sign('DANGER — CHARGE ZONE', 37.57, 2.7, 23, 5, 0.8, -Math.PI / 2, { accent: P.hazard });
  // Covered Vent Run with a court access opening in its northern wall.
  for (const x of [-9,9]) box(x, 1.45, 24, 10, 2.9, 0.35, m.shadow, 'Vent Run wall');
  box(0, 1.45, 30, 28, 2.9, 0.35, m.shadow, 'Vent Run wall');
  box(0, 3.05, 27, 28, 0.3, 6.4, m.steel, 'Vent Run roof');
  for (const x of [-14,-7,7,14]) for (const z of [24,30]) box(x, 1.45, z, 0.2, 2.9, 0.2, m.steelDark, 'duct rib');
  for (const x of [-10,0,10]) box(x, 2.86, 27, 0.8, 0.05, 0.3, m.glint, 'duct light');
  sign('VENT RUN', -14.2, 3.7, 27, 3.8, 0.8, -Math.PI / 2, { arrow: 'right', subtitle: 'Battery Hall B' });
  sign('BATTERY HALL', 0, 2, 23.75, 4, 0.8, Math.PI, { arrow: 'left' });
  pipeStack(-23, 30, 3, 5); crate(-19, 19, 2.4, 1.8, 2);
  barrier(14, 16, 2.8); barrier(36, 7, 2, 3);
  cyl(-7, 2.3, -29, 2.5, 4.6, m.shadow, 'water tank');
  cyl(-7, 4.75, -29, 2.65, 0.3, m.steel, 'tank lid');
  for (const x of [-8.5,-5.5]) box(x, 0.45, -29, 0.25, 0.9, 2, m.steel, 'tank footing');
  sign('WATER / 04', -7, 2.6, -26.45, 3, 0.7);
  // Haze silhouettes outside the enclosure are scenery, not playable solids.
  for (let i = 0; i < 16; i++) {
    const x = -90 + i * 12, h = 5 + rand() * 13;
    add(new THREE.ConeGeometry(10 + rand() * 9, h, 4), m.wall, x, h / 2 - 1, -62 - rand() * 12, 1, 1, 1, null);
  }
  batchStatic(yard);
  scene.updateMatrixWorld(true);
  return {
    scene, group: yard, materials: m, colliders, graph, holdSpots, sites, spawns, bounds,
    move, collide, groundHeight, lineOfSight, traceSegment, findPath, nearestNode, siteAt,
    dispose() {
      const geometries = new Set(), materials = new Set(Object.values(m)), textures = new Set();
      scene.traverse(o => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      for (const mat of materials) { if (mat.map) textures.add(mat.map); mat.dispose(); }
      for (const texture of textures) texture.dispose();
      for (const geometry of geometries) geometry.dispose();
      scene.clear(); colliders.length = 0;
    },
  };
}

// Bake each material into one mesh. Collision boxes remain independent, while
// hundreds of trim pieces and steps cost only a few dozen static draw calls.
function batchStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), v = new THREE.Vector3(), n = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  for (const mesh of root.children) {
    if (!groups.has(mesh.material)) groups.set(mesh.material, []);
    groups.get(mesh.material).push(mesh);
  }
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    let count = 0;
    for (const mesh of meshes) count += mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
    const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
    let offset = 0;
    for (const mesh of meshes) {
      const g = mesh.geometry, a = g.attributes, indices = g.index;
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      const length = indices ? indices.count : a.position.count;
      for (let i = 0; i < length; i++, offset++) {
        const j = indices ? indices.getX(i) : i;
        v.fromBufferAttribute(a.position, j).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(a.normal, j).applyNormalMatrix(normalMatrix);
        positions[offset * 3] = v.x; positions[offset * 3 + 1] = v.y; positions[offset * 3 + 2] = v.z;
        normals[offset * 3] = n.x; normals[offset * 3 + 1] = n.y; normals[offset * 3 + 2] = n.z;
        if (a.uv) { uvs[offset * 2] = a.uv.getX(j); uvs[offset * 2 + 1] = a.uv.getY(j); }
      }
      root.remove(mesh);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = 'Yard static batch'; mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
    root.add(mesh);
  }
}
