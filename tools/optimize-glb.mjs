// Optimiza el GLB de Blender para la web:  npm run optimize:glb [-- opciones]
//
//   entrada : assets-src/su30.glb      (el export de Blender, sin tocar)
//   salida  : public/models/su30.glb   (lo que carga la web)
//
// Opciones:  --tex 512      lado máximo de las texturas grandes (px)
//            --quality 60   calidad WebP de las texturas grandes (0-100)
//
// Qué hace y por qué (cada paso reduce un coste distinto):
//  1. Créditos: reinyecta asset.extras (CC BY exige atribuir; Blender lo borra al exportar).
//  2. Cristal: quita 4 cuadritos sueltos de las alas que viven dentro de `canopy_glass`.
//     Inflan su esfera envolvente a 14 m, y three.js ordena los objetos transparentes
//     por la distancia a ese centro: con la esfera mal centrada, el cristal y el
//     combinador se pintarían en orden incorrecto.
//  3. Pilotos: 92 triángulos sueltos -> 2 mallas (`pilot_front`, `pilot_rear`).
//     Cada malla es al menos un draw call (la CPU le dice a la GPU "dibuja esto"),
//     y la meta es < 100 en total. El piloto delantero va separado porque hay que
//     ocultarlo en primera persona (la cámara está dentro de su cabeza).
//  4. Fusiona piezas que comparten material (Material.001 x5 ...), salvo las que
//     el código necesita por nombre (canopy_glass, hud_combiner, panel_*, mfd_main).
//  5. Texturas: PNG -> WebP. Las pequeñas (<=64 px) van sin pérdida; las grandes
//     se reducen y comprimen con pérdida. La GPU las descomprime a RGBA igualmente,
//     así que esto ahorra descarga, no memoria de vídeo.
//  6. Geometría: reordena vértices (caché de la GPU), cuantiza (float32 -> enteros de
//     14/12/8 bits: un avión de 22 m con 14 bits tiene resolución de ~1.3 mm) y
//     comprime con Meshopt (se descomprime con WASM al cargar).
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, join, meshopt, textureCompress, compactPrimitive, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const SRC = arg('in', 'assets-src/su30.glb');
const DST = arg('out', 'public/models/su30.glb');
const TEX = Number(arg('tex', 512));
const QUALITY = Number(arg('quality', 60));

// Nombres que el código buscará: si desaparece alguno, preferimos fallar aquí.
const REQUIRED = ['cam_pilot', 'hud_anchor', 'mfd_main', 'hud_combiner', 'panel_front', 'panel_rear', 'canopy_glass', 'pilot_front', 'pilot_rear'];

const CREDITS = {
  title: 'Su-30 MKI loadout#1 [Brahmos]',
  author: 'abhinab.das000 (https://sketchfab.com/abhinab.das000)',
  license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
  source: 'https://sketchfab.com/3d-models/su-30-mki-loadout1-brahmos-e9b810ba081544d0997ad8cce4b95fc8',
};

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(SRC);
const root = doc.getRoot();
const byName = (n) => root.listNodes().find((x) => x.getName() === n);
const worldCenter = (node) => { const b = getBounds(node); return b.min.map((v, k) => (v + b.max[k]) / 2); };
const stats = () => {
  const nodes = root.listNodes().filter((n) => n.getMesh());
  const prims = nodes.flatMap((n) => n.getMesh().listPrimitives());
  const tris = prims.reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  return { meshNodes: nodes.length, drawCalls: prims.length, tris };
};
const before = stats();

// ---- 1. créditos ----
const asset = root.getAsset();
if (!asset.extras) { asset.extras = CREDITS; console.log('· créditos reinyectados en asset.extras'); }

// ---- 2. piezas sueltas dentro de canopy_glass ----
{
  const node = byName('canopy_glass');
  const M = node.getWorldMatrix();
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idxAcc = prim.getIndices();
    const idx = idxAcc.getArray(), n = pos.getCount();
    // Union-find sobre vértices "soldados" por posición, para que las costuras de UV/normales no corten una pieza en dos.
    const keyOf = (i) => pos.getElement(i, []).map((v) => v.toFixed(4)).join('|');
    const first = new Map(); const rep = Array.from({ length: n }, (_, i) => { const k = keyOf(i); if (!first.has(k)) first.set(k, i); return first.get(k); });
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (let t = 0; t < idx.length; t += 3) for (const o of [1, 2]) parent[find(rep[idx[t + o]])] = find(rep[idx[t]]);
    // Máximo |x| mundial por pieza: el cristal de la cabina cabe en |x|<0.6 m; los cuadritos están a |x|>6 m.
    const maxX = new Map();
    for (let i = 0; i < n; i++) { const [x, y, z] = pos.getElement(i, []); const wx = M[0] * x + M[4] * y + M[8] * z + M[12]; const r = find(rep[i]); maxX.set(r, Math.max(maxX.get(r) ?? 0, Math.abs(wx))); }
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) if (maxX.get(find(rep[idx[t]])) < 2) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    if (keep.length < idx.length) {
      console.log(`· canopy_glass: ${(idx.length - keep.length) / 3} triángulos sueltos eliminados`);
      idxAcc.setArray(new idx.constructor(keep));
      compactPrimitive(prim); // descarta los vértices que quedaron sin usar
    }
  }
}

// ---- 3. pilotos: contenedores separados para poder fusionarlos y ocultar el delantero ----
{
  const pieces = root.listNodes().filter((n) => n.getMesh()?.listPrimitives().every((p) => p.getMaterial()?.getName() === 'PilotMat.001'));
  if (pieces.length) {
    const parent = pieces[0].getParentNode();
    const mk = (name) => { const c = doc.createNode(name); parent.addChild(c); return c; };
    const front = mk('pilot_front'), rear = mk('pilot_rear');
    for (const p of pieces) {
      const dst = worldCenter(p)[2] > 5 ? front : rear; // delantero: z > 5 m (ver inspect:glb)
      parent.removeChild(p); dst.addChild(p); p.setName(''); p.getMesh().setName('');
    }
    console.log(`· pilotos: ${pieces.length} piezas -> pilot_front / pilot_rear`);
  }
}

// Los nombres autogenerados de Blender ("Object_12") no aportan nada: se quitan
// para que `join` pueda fusionar esas mallas. Los nombres con significado se conservan.
for (const n of root.listNodes()) if (/^Object_/.test(n.getName())) n.setName('');
for (const m of root.listMeshes()) if (/^Object_/.test(m.getName())) m.setName('');

// ---- 4-6. transformaciones ----
// OJO: prune() y join() borran por defecto los nodos hoja vacíos, que es justo lo que son
// cam_pilot y hud_anchor (puntos de referencia). Por eso keepLeaves:true y cleanup:false.
const bigTextures = [], smallTextures = [];
for (const t of root.listTextures()) (Math.max(...t.getSize()) > 64 ? bigTextures : smallTextures).push(t);
bigTextures.forEach((t, i) => t.setName(`big-${i}`));
smallTextures.forEach((t, i) => t.setName(`small-${i}`));

await doc.transform(
  dedup(),
  join({ keepNamed: true, cleanup: false }),
  weld(),
  prune({ keepLeaves: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /^small-/, lossless: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /^big-/, resize: [TEX, TEX], quality: QUALITY, effort: 6 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }), // = reorder + quantize + compresión Meshopt
);

// Nombre de las mallas fusionadas de los pilotos: nodo con malla dentro de cada contenedor.
for (const c of ['pilot_front', 'pilot_rear']) for (const ch of byName(c)?.listChildren() ?? []) { ch.setName(`${c}_mesh`); ch.getMesh()?.setName(`${c}_mesh`); }

fs.mkdirSync(path.dirname(DST), { recursive: true });
await io.write(DST, doc);

// ---- verificación: releer lo escrito (decodificando Meshopt) y comparar ----
const out = await io.read(DST);
const oroot = out.getRoot();
const names = new Set(oroot.listNodes().map((n) => n.getName()));
const missing = REQUIRED.filter((n) => !names.has(n));
const after = (() => { const nodes = oroot.listNodes().filter((n) => n.getMesh()); const prims = nodes.flatMap((n) => n.getMesh().listPrimitives());
  return { meshNodes: nodes.length, drawCalls: prims.length, tris: prims.reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0) }; })();
const srcSize = fs.statSync(SRC).size, dstSize = fs.statSync(DST).size;
console.log('\n=== Resultado ===');
console.log(`tamaño      ${(srcSize / 1048576).toFixed(2)} MB -> ${(dstSize / 1048576).toFixed(2)} MB  (${(100 - (100 * dstSize) / srcSize).toFixed(0)}% menos)`);
console.log(`draw calls  ${before.drawCalls} -> ${after.drawCalls}   triángulos ${before.tris} -> ${after.tris}`);
for (const t of oroot.listTextures()) console.log(`textura     ${t.getName().padEnd(8)} ${t.getMimeType()} ${t.getSize().join('x')} ${(t.getImage().byteLength / 1024).toFixed(1)} KB`);
console.log('créditos    ', oroot.getAsset().extras ? 'presentes' : 'AUSENTES');
console.log('extensiones ', oroot.listExtensionsUsed().map((e) => e.extensionName).join(', '));
for (const n of ['cam_pilot', 'hud_anchor', 'mfd_main']) { const nd = oroot.listNodes().find((x) => x.getName() === n); if (nd) console.log(`${n.padEnd(11)} mundo (${nd.getWorldTranslation().map((v) => v.toFixed(3)).join(', ')})`); }
if (missing.length) { console.error(`\n✗ FALTAN nodos requeridos: ${missing.join(', ')}`); process.exit(1); }
console.log('✓ todos los nodos requeridos presentes');
