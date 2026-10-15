// Inspector de GLB sin dependencias: `npm run inspect:glb [ruta.glb]`.
//
// Un GLB es un contenedor binario: cabecera (12 B) + chunk JSON (la descripción
// de la escena: nodos, mallas, materiales...) + chunk BIN (vértices e imágenes).
// Para auditar el modelo basta con el JSON y los min/max que cada accessor de
// POSITION guarda, así que no hace falta cargar three ni una GPU.
//
// Matemática clave: la posición de un nodo en el mundo es el producto de las
// matrices de todos sus ancestros, M_mundo = M_padre · M_local. En glTF las
// matrices son 4x4 column-major y cada nodo guarda T (traslación), R (cuaternión)
// y S (escala): M_local = T · R · S.
import fs from 'node:fs';

const file = process.argv[2] ?? 'public/models/su30.glb';
const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('No es un GLB (magic "glTF" ausente)');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8; // el chunk BIN tiene su propia cabecera de 8 B

// ---------- álgebra 4x4 column-major ----------
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
// Cuaternión (x,y,z,w) -> matriz de rotación, luego escala y traslación.
function localMatrix(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const parentOf = {};
json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parentOf[c] = i)));
const cache = {};
const worldMatrix = (i) => (cache[i] ??= mul(parentOf[i] === undefined ? I4 : worldMatrix(parentOf[i]), localMatrix(json.nodes[i])));
const xform = (M, v) => [0, 1, 2].map((k) => M[k] * v[0] + M[4 + k] * v[1] + M[8 + k] * v[2] + M[12 + k]);
const rotate = (M, v) => [0, 1, 2].map((k) => M[k] * v[0] + M[4 + k] * v[1] + M[8 + k] * v[2]); // sólo rotación (normales)
const f = (v, d = 3) => '(' + v.map((x) => (+x).toFixed(d)).join(', ') + ')';
const idxOf = (name) => json.nodes.findIndex((n) => n.name === name);

// ---------- lectura de accessors ----------
const COMP = { 5126: [Float32Array, 4, 'getFloat32'], 5123: [Uint16Array, 2, 'getUint16'], 5125: [Uint32Array, 4, 'getUint32'], 5121: [Uint8Array, 1, 'getUint8'] };
function readAccessor(i) {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const nc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const [, size, getter] = COMP[a.componentType];
  const stride = bv.byteStride ?? nc * size;
  const base = binStart + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return Array.from({ length: a.count }, (_, k) => {
    const row = Array.from({ length: nc }, (_, c) => dv[getter](base + k * stride + c * size, true));
    return nc === 1 ? row[0] : row;
  });
}

// ---------- caja delimitadora mundial de un nodo con malla ----------
function worldBBox(i) {
  const n = json.nodes[i];
  if (n.mesh === undefined) return null;
  const M = worldMatrix(i);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of json.meshes[n.mesh].primitives) {
    const a = json.accessors[p.attributes.POSITION];
    for (let c = 0; c < 8; c++) {
      const w = xform(M, [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]]);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
    }
  }
  return { lo, hi, center: lo.map((l, k) => (l + hi[k]) / 2), size: lo.map((l, k) => hi[k] - l) };
}
const triCount = (m) => m.primitives.reduce((s, p) => s + (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3, 0);
const matName = (m) => [...new Set(m.primitives.map((p) => json.materials[p.material]?.name ?? '(sin material)'))].join('|');

// ================= INFORME =================
console.log(`Archivo: ${file}  (${(buf.length / 1048576).toFixed(2)} MB)`);
console.log('asset:', JSON.stringify(json.asset));
console.log('extensionsUsed:', json.extensionsUsed ?? []);
const meshNodes = json.nodes.map((n, i) => i).filter((i) => json.nodes[i].mesh !== undefined);
const totalTris = meshNodes.reduce((s, i) => s + triCount(json.meshes[json.nodes[i].mesh]), 0);
console.log(`nodos=${json.nodes.length}  nodos con malla=${meshNodes.length}  mallas=${json.meshes.length}  materiales=${json.materials.length}  texturas=${json.textures?.length}  imágenes=${json.images?.length}`);
console.log(`triángulos=${totalTris}   (cada nodo con malla = al menos 1 draw call por primitiva: ${meshNodes.reduce((s, i) => s + json.meshes[json.nodes[i].mesh].primitives.length, 0)})`);

console.log('\n--- Marcadores y mallas con nombre (coordenadas MUNDO, tras aplicar la jerarquía) ---');
for (const name of ['cam_pilot', 'hud_anchor', 'mfd_main', 'hud_combiner', 'panel_front', 'panel_rear', 'canopy_glass']) {
  const i = idxOf(name);
  if (i < 0) { console.log(`✗ ${name}: NO EXISTE`); continue; }
  const b = worldBBox(i), M = worldMatrix(i);
  if (b) console.log(`✓ ${name.padEnd(13)} malla, ${triCount(json.meshes[json.nodes[i].mesh])} tris, material=${matName(json.meshes[json.nodes[i].mesh])}\n    centro ${f(b.center)}  tamaño ${f(b.size)}`);
  else console.log(`✓ ${name.padEnd(13)} empty en ${f([M[12], M[13], M[14]])}`);
}

// Orientación de mfd_main: su normal local es +Y; la llevamos al mundo.
{
  const i = idxOf('mfd_main');
  if (i >= 0) {
    const nRaw = rotate(worldMatrix(i), [0, 1, 0]);
    const len = Math.hypot(...nRaw); // la escala del nodo (0.07) alarga el vector: normalizamos
    const n = nRaw.map((v) => v / len);
    const eye = worldMatrix(idxOf('cam_pilot')).slice(12, 15), c = worldBBox(i).center;
    const toEye = [0, 1, 2].map((k) => eye[k] - c[k]);
    const dot = n.reduce((s, v, k) => s + v * toEye[k], 0);
    console.log(`\nmfd_main normal mundo ${f(n)} → ${dot > 0 ? 'mira al piloto ✓' : '✗ MIRA HACIA DELANTE, lejos del piloto (se ve la cara trasera y la textura espejada)'}`);
  }
}

console.log('\n--- Comprobación contra las medidas del CLAUDE.md ---');
{
  const cam = worldMatrix(idxOf('cam_pilot')).slice(12, 15);
  const hudAnchor = worldMatrix(idxOf('hud_anchor')).slice(12, 15);
  const hudBox = worldBBox(idxOf('hud_combiner'));
  console.log('ojos documentados (0, 1.35, 5.6)      vs cam_pilot', f(cam));
  console.log('vidrio HUD documentado (0, 1.165, 6.31) vs centro hud_combiner', f(hudBox.center), 'tamaño', f(hudBox.size));
  console.log('hud_anchor', f(hudAnchor), '→ ángulo de depresión cam→anchor:', (Math.atan2(cam[1] - hudAnchor[1], hudAnchor[2] - cam[2]) * 180 / Math.PI).toFixed(1) + '°');
  const all = meshNodes.map(worldBBox);
  const lo = [0, 1, 2].map((k) => Math.min(...all.map((b) => b.lo[k]))), hi = [0, 1, 2].map((k) => Math.max(...all.map((b) => b.hi[k])));
  console.log(`envergadura(X)=${(hi[0] - lo[0]).toFixed(2)} m  altura(Y)=${(hi[1] - lo[1]).toFixed(2)} m  largo(Z)=${(hi[2] - lo[2]).toFixed(2)} m`);
}

console.log('\n--- Piezas del piloto (PilotMat.001): mallas sueltas que conviene fusionar ---');
{
  const pilots = meshNodes.filter((i) => matName(json.meshes[json.nodes[i].mesh]) === 'PilotMat.001');
  const front = pilots.filter((i) => worldBBox(i).center[2] > 5), rear = pilots.filter((i) => worldBBox(i).center[2] <= 5);
  console.log(`${pilots.length} nodos (delantero ${front.length}: ${json.nodes[front[0]].name}…${json.nodes[front.at(-1)].name}, trasero ${rear.length})`);
  const cam = worldMatrix(idxOf('cam_pilot')).slice(12, 15);
  // La cabeza es una cáscara hueca de triángulos sueltos: ninguna pieza individual
  // contiene a la cámara, pero sí la caja de la unión de las piezas de la cabeza
  // (las de altura ~1.1–1.7 m). Si cam_pilot cae ahí, hay que ocultar al piloto.
  const head = front.filter((i) => { const b = worldBBox(i); return b.lo[1] >= 1.1 && b.hi[1] <= 1.7; });
  const boxes = head.map(worldBBox);
  const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.lo[k]))), hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.hi[k])));
  const inside = [0, 1, 2].every((k) => cam[k] >= lo[k] && cam[k] <= hi[k]);
  console.log(`cabeza del piloto delantero (${head.length} piezas): caja ${f(lo)} → ${f(hi)}`);
  console.log(`cam_pilot ${inside ? 'QUEDA DENTRO de esa caja → ocultar al piloto delantero en primera persona' : 'queda fuera de esa caja'}`);
}

console.log('\n--- canopy_glass: componentes conexas (¿hay piezas ajenas a la cabina?) ---');
{
  const i = idxOf('canopy_glass'), M = worldMatrix(i), p = json.meshes[json.nodes[i].mesh].primitives[0];
  const pos = readAccessor(p.attributes.POSITION), idx = readAccessor(p.indices);
  const rep = new Map(), id = pos.map((v, k) => { const key = v.map((x) => x.toFixed(4)).join('|'); if (!rep.has(key)) rep.set(key, k); return rep.get(key); });
  const par = pos.map((_, k) => k); const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  for (let t = 0; t < idx.length; t += 3) { const a = find(id[idx[t]]); par[find(id[idx[t + 1]])] = a; par[find(id[idx[t + 2]])] = a; }
  const groups = new Map();
  pos.forEach((v, k) => { const r = find(id[k]); (groups.get(r) ?? groups.set(r, []).get(r)).push(xform(M, v)); });
  [...groups.values()].forEach((g, gi) => {
    const lo = [0, 1, 2].map((k) => Math.min(...g.map((v) => v[k]))), hi = [0, 1, 2].map((k) => Math.max(...g.map((v) => v[k])));
    console.log(`  pieza ${gi}: ${String(g.length).padStart(3)} vértices  x[${lo[0].toFixed(2)},${hi[0].toFixed(2)}] y[${lo[1].toFixed(2)},${hi[1].toFixed(2)}] z[${lo[2].toFixed(2)},${hi[2].toFixed(2)}]`);
  });
}

console.log('\n--- Materiales ---');
json.materials.forEach((m, i) => {
  const pbr = m.pbrMetallicRoughness ?? {};
  const flags = [m.alphaMode && m.alphaMode !== 'OPAQUE' ? `alpha=${m.alphaMode}` : '', m.emissiveTexture ? `emisiva(img ${json.textures[m.emissiveTexture.index].source}, x${m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1})` : '', pbr.baseColorTexture ? `base(img ${json.textures[pbr.baseColorTexture.index].source})` : ''].filter(Boolean).join(' ');
  console.log(`  [${String(i).padStart(2)}] ${m.name.padEnd(18)} ${flags}`);
});

console.log('\n--- Imágenes ---');
json.images.forEach((im, i) => {
  const o = binStart + (json.bufferViews[im.bufferView].byteOffset ?? 0);
  console.log(`  [${i}] ${im.mimeType} ${buf.readUInt32BE(o + 16)}x${buf.readUInt32BE(o + 20)}  ${(json.bufferViews[im.bufferView].byteLength / 1024).toFixed(1)} KB`);
});

console.log('\n--- Créditos (asset.extras) ---');
console.log(json.asset.extras ? JSON.stringify(json.asset.extras, null, 2) : '✗ AUSENTE: el export de Blender los eliminó; hay que reinyectarlos');
