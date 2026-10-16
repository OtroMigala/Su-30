import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rig, useFlight } from '../../store/flight';
import type { CockpitRefs } from '../../scene/cockpit';
import { attitudeQuaternion, boundsFromPoints, type HudRect } from './projection';
import { drawHud } from './draw';

/**
 * Escala del combinador respecto al modelo. El vidrio real abarca ~15° × 12° desde los ojos del
 * piloto: fiel, pero en pantalla queda diminuto (~200 px en 1080p). Se agranda alrededor de su
 * centro y luego se "empuja" (COMBINER_PUSH) para que el arco del parabrisas y los soportes lo
 * recorten como estructura real. En desarrollo se prueba otro valor con /?hud=1.6&push=1.5
 */
export const COMBINER_SCALE = 2;

/** Distancia del plano de la simbología (m). Lejos ⇒ sin paralaje al mover la cabeza (colimado). */
const HUD_DISTANCE = 1000;
/** Lado máximo del canvas (texels): limita memoria y la subida de la textura por fotograma. */
const MAX_TEXELS = 2048;

/**
 * Empuje del vidrio alrededor del ojo (ver setupCombiner). Al agrandarlo desde su centro, su borde
 * superior (el vidrio está inclinado hacia el piloto) queda MÁS CERCA que el arco del parabrisas
 * (0.74 m) y la simbología se pintaría encima del marco. Con 1.8 el vidrio pasa a ~1.3 m, detrás.
 */
export const COMBINER_PUSH = 1.8;
const pushParam = () => {
  if (!import.meta.env.DEV) return COMBINER_PUSH;
  const v = Number(new URLSearchParams(location.search).get('push'));
  return v > 0 ? v : COMBINER_PUSH;
};

const scaleParam = () => {
  if (!import.meta.env.DEV) return COMBINER_SCALE;
  const v = Number(new URLSearchParams(location.search).get('hud'));
  return v > 0 ? v : COMBINER_SCALE;
};

/**
 * Prepara el combinador como MÁSCARA DE STENCIL.
 *
 * El stencil buffer guarda un entero por píxel. El vidrio, al dibujarse, escribe un 1 en cada
 * píxel que cubre (función ALWAYS, operación REPLACE) siempre que pase la prueba de profundidad:
 * donde el marco del parabrisas o el tablero están delante, no escribe. Después el plano del HUD
 * sólo se pinta donde el stencil vale 1 (función EQUAL). Resultado: la simbología aparece
 * exclusivamente "dentro" del vidrio visible, con bordes exactos sin calcular ningún recorte.
 */
function setupCombiner(combiner: THREE.Mesh, scale: number, root: THREE.Object3D, eye: THREE.Vector3, push: number) {
  // Material propio: si el del GLB lo comparten otras mallas, también escribirían en el stencil.
  if (!combiner.userData.hudMaterial) {
    combiner.material = (combiner.material as THREE.Material).clone();
    combiner.userData.hudMaterial = true;
    combiner.userData.baseMatrix = combiner.matrix.clone();
  }
  const m = combiner.material as THREE.MeshStandardMaterial;
  m.stencilWrite = true;
  m.stencilRef = 1;
  m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilZPass = THREE.ReplaceStencilOp;

  // Escala alrededor del centro de la geometría: M = M₀ · T(c) · S(k) · T(−c). Se parte siempre de
  // la matriz original (userData.baseMatrix) para que repetirlo no acumule escalas.
  combiner.geometry.computeBoundingBox();
  const c = combiner.geometry.boundingBox!.getCenter(new THREE.Vector3());
  const M = (combiner.userData.baseMatrix as THREE.Matrix4)
    .clone()
    .multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));

  // Empuje alrededor del OJO: escalar por `push` con centro en el ojo desliza cada punto a lo largo
  // de su propio rayo de visión (P' = E + push·(P − E)). El ángulo bajo el que se ve no cambia, pero
  // el vidrio queda más lejos, detrás del arco del parabrisas y de los soportes, que así lo tapan.
  // Se hace en el marco del cuerpo (root) y se vuelve al marco del padre del combinador.
  if (push !== 1) {
    root.updateMatrixWorld(true);
    const parentToRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(combiner.parent!.matrixWorld);
    const P = new THREE.Matrix4()
      .makeTranslation(eye.x, eye.y, eye.z)
      .multiply(new THREE.Matrix4().makeScale(push, push, push))
      .multiply(new THREE.Matrix4().makeTranslation(-eye.x, -eye.y, -eye.z));
    M.premultiply(parentToRoot).premultiply(P).premultiply(parentToRoot.clone().invert());
  }
  M.decompose(combiner.position, combiner.quaternion, combiner.scale);
  combiner.updateMatrix();
  combiner.updateMatrixWorld(true);
}

/** Vértices del combinador en el marco del cuerpo (el de la escena del GLB). */
function combinerPoints(combiner: THREE.Mesh, root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(combiner.matrixWorld);
  const pos = combiner.geometry.getAttribute('position');
  return Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toRoot));
}

/**
 * HUD del combinador: simbología dibujada en un canvas 2D, pegada como textura a un plano a
 * HUD_DISTANCE metros delante de los ojos del piloto, y recortada por el stencil del vidrio.
 * Es hijo del grupo del avión: se mueve con él, como el HUD real atornillado a la cabina.
 */
export function CombinerHud({ cockpit, root }: { cockpit: CockpitRefs; root: THREE.Object3D }) {
  const mesh = useRef<THREE.Mesh>(null);
  const size = useThree((s) => s.size);
  const dprNow = useThree((s) => s.viewport.dpr);

  // Rectángulo (en tangentes) que cubre el combinador escalado visto desde los ojos.
  const rect = useMemo<HudRect | null>(() => {
    const comb = cockpit.combiner;
    if (!comb) return null;
    setupCombiner(comb, scaleParam(), root, cockpit.pilotPos, pushParam());
    return boundsFromPoints(combinerPoints(comb, root), cockpit.pilotPos, 0.04);
  }, [cockpit, root]);

  // Canvas con tantos texels como píxeles de pantalla ocupa el vidrio (ni más, que se desperdicia
  // memoria y ancho de banda, ni menos, que se ve borroso).
  // Píxeles de pantalla por unidad de tangente: en una cámara perspectiva, tan(fov/2) ocupa media
  // altura de la ventana ⇒ (alto/2) / tan(fov/2). Se usa el FOV de la cabina (62°).
  const tex = useMemo(() => {
    if (!rect) return null;
    const pxPerTan = size.height / 2 / Math.tan((62 * Math.PI) / 360);
    const want = (rect.x1 - rect.x0) * pxPerTan * dprNow;
    const k = Math.min(1, MAX_TEXELS / want) * dprNow; // texels por píxel CSS
    const w = Math.round((rect.x1 - rect.x0) * pxPerTan * k);
    const h = Math.round((rect.y1 - rect.y0) * pxPerTan * k);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(64, w);
    canvas.height = Math.max(64, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false; // se ve casi 1:1; los mipmaps costarían en cada subida
    texture.minFilter = THREE.LinearFilter;
    return { canvas, ctx: canvas.getContext('2d')!, texture, k };
  }, [rect, size.height, dprNow]);
  useEffect(() => () => tex?.texture.dispose(), [tex]);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending, // un combinador sólo suma luz
        depthTest: false, // el vidrio y la cabina están más cerca: la visibilidad la decide el stencil
        depthWrite: false,
        toneMapped: false,
        stencilWrite: true, // en three activa la prueba de stencil
        stencilRef: 1,
        stencilFunc: THREE.EqualStencilFunc,
      }),
    [],
  );
  useEffect(() => {
    material.map = tex?.texture ?? null;
    material.needsUpdate = true;
  }, [material, tex]);
  useEffect(() => () => material.dispose(), [material]);

  // Geometría y posición del plano: perpendicular a la nariz, a D metros, cubriendo `rect`.
  // Un punto (x, y) del plano gnomónico (distancia 1) está a D·(x, y) del eje en el plano real.
  const placement = useMemo(() => {
    if (!rect) return null;
    const D = HUD_DISTANCE;
    const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
    return {
      size: [(rect.x1 - rect.x0) * D, (rect.y1 - rect.y0) * D] as const,
      // x del plano positiva = derecha del piloto = −X del cuerpo
      position: new THREE.Vector3(-cx * D, cy * D, D).add(cockpit.pilotPos),
    };
  }, [rect, cockpit]);

  const attitude = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m || !tex || !rect) return;
    // Sólo dentro de la cabina (desde fuera también se vería a través del vidrio).
    m.visible = rig.enter > 0.9;
    if (!m.visible) return;
    const f = rig.flight;
    attitudeQuaternion(f.pitch, f.roll, attitude);
    drawHud({ ctx: tex.ctx, w: tex.canvas.width, h: tex.canvas.height, rect, k: tex.k }, f, attitude, useFlight.getState().declutter);
    tex.texture.needsUpdate = true; // sube el canvas a la GPU en este fotograma
  });

  if (!placement) return null;
  return (
    // rotation y = π: el plano mira por defecto a +Z; girado, su cara mira al piloto y su +X local
    // pasa a −X del cuerpo (la derecha del piloto), así el canvas no sale espejado.
    <mesh ref={mesh} position={placement.position} rotation={[0, Math.PI, 0]} material={material} renderOrder={2.5} frustumCulled={false}>
      <planeGeometry args={[placement.size[0], placement.size[1]]} />
    </mesh>
  );
}
