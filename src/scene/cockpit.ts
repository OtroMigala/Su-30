import * as THREE from 'three';

// Medidas de respaldo del CLAUDE.md, por si falta algún marcador en el GLB.
const FALLBACK = {
  cam_pilot: new THREE.Vector3(0, 1.35, 5.6),
  hud_anchor: new THREE.Vector3(0, 1.165, 6.31),
};

export interface CockpitRefs {
  /** Ojos del piloto (cam_pilot) en el espacio del avión, en metros. */
  pilotPos: THREE.Vector3;
  /** Centro del vidrio del HUD (hud_anchor). */
  hudAnchor: THREE.Vector3;
  /** Vidrio del HUD: máscara de stencil de la simbología (hud/combiner). */
  combiner: THREE.Mesh | undefined;
  /** Piloto delantero: se oculta en primera persona porque la cámara está dentro de su cabeza. */
  pilotFront: THREE.Object3D | undefined;
  mfd: THREE.Mesh | undefined;
}

/**
 * Interruptor del arreglo por código de `mfd_main` (ver fixMfd).
 * Ponlo en false cuando lo corrijas a mano en Blender; de todas formas el arreglo
 * sólo se aplica si detecta que el plano sigue mal orientado.
 */
const MFD_AUTOFIX = true;

/**
 * Prepara el modelo cargado: localiza marcadores, ajusta materiales y arregla el MFD.
 * Es idempotente (llamarla dos veces deja lo mismo), porque useGLTF cachea la escena
 * y React StrictMode ejecuta los efectos dos veces en desarrollo.
 */
export function prepareCockpit(scene: THREE.Object3D): CockpitRefs {
  scene.updateMatrixWorld(true);

  const marker = (name: keyof typeof FALLBACK) => {
    const o = scene.getObjectByName(name);
    if (!o) {
      console.warn(`[cabina] Falta el nodo "${name}" en el GLB; uso la medida de respaldo.`);
      return FALLBACK[name].clone();
    }
    return o.getWorldPosition(new THREE.Vector3());
  };
  const pilotPos = marker('cam_pilot');
  const hudAnchor = marker('hud_anchor');

  // --- Transparencias: el orden de dibujo importa ---
  // Con alpha blending el color final es: C = α·C_objeto + (1−α)·C_fondo. No es conmutativo,
  // así que hay que pintar de lejos a cerca. three.js ordena por el centro de la esfera
  // envolvente; para no depender de eso fijamos el orden: cristal (1) y luego combinador (2).
  const glass = scene.getObjectByName('canopy_glass') as THREE.Mesh | undefined;
  if (glass) {
    glass.renderOrder = 1;
    const m = glass.material as THREE.MeshStandardMaterial;
    m.depthWrite = false; // un cristal translúcido no debe tapar lo que tiene detrás
  }
  const combiner = scene.getObjectByName('hud_combiner') as THREE.Mesh | undefined;
  if (combiner) {
    combiner.renderOrder = 2;
    const m = combiner.material as THREE.MeshStandardMaterial;
    m.depthWrite = false;
    // El GLB lo trae negro al 50 %, que apagaría el horizonte justo donde irá el HUD.
    // Un combinador real es casi transparente. CombinerHud lo convierte en máscara de stencil.
    m.opacity = 0.12;
  }

  const mfd = scene.getObjectByName('mfd_main') as THREE.Mesh | undefined;
  if (mfd) {
    if (MFD_AUTOFIX && !orientation(mfd, pilotPos).facesPilot) fixMfd(mfd, pilotPos);
    if (!mfd.userData.placeholder) {
      mfd.material = createMfdPlaceholder();
      mfd.userData.placeholder = true;
    }
    mfd.renderOrder = 3;
  }

  if (!combiner) console.warn('[cabina] Falta "hud_combiner" en el GLB: el HUD del combinador no se dibujará.');
  return { pilotPos, hudAnchor, combiner, pilotFront: scene.getObjectByName('pilot_front'), mfd };
}

// ---------------------------------------------------------------------------------------
// MFD (mfd_main)
// ---------------------------------------------------------------------------------------

/**
 * Cómo se ve el plano desde el asiento. El piloto mira a +Z con +Y arriba, así que su
 * derecha es −X (derecha = adelante × arriba = Z × Y = −X).
 * glTF pone el origen UV (0,0) arriba a la izquierda de la imagen: u crece hacia la derecha
 * y v hacia abajo. Para verla bien, ir de u=0 a u=1 debe avanzar hacia −X, e ir de v=1 a
 * v=0 debe subir (+Y).
 */
function orientation(mfd: THREE.Mesh, pilotPos: THREE.Vector3) {
  mfd.updateWorldMatrix(true, false);
  const pos = mfd.geometry.getAttribute('position');
  const uv = mfd.geometry.getAttribute('uv');
  const at = (u: number, v: number) => {
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(uv.getX(i) - u) < 1e-3 && Math.abs(uv.getY(i) - v) < 1e-3) {
        return new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mfd.matrixWorld);
      }
    }
    return new THREE.Vector3();
  };
  // Normal de la cara frontal (la del sentido antihorario). Este plano tiene normal local +Y.
  const normal = new THREE.Vector3(0, 1, 0).transformDirection(mfd.matrixWorld);
  const center = new THREE.Box3().setFromObject(mfd).getCenter(new THREE.Vector3());
  const du = at(1, 1).sub(at(0, 1)); // sentido en que crece u
  const dv = at(0, 0).sub(at(0, 1)); // sentido en que v disminuye (hacia arriba en la imagen)
  return {
    facesPilot: normal.dot(pilotPos.clone().sub(center)) > 0,
    mirrored: -du.x <= 0,
    upsideDown: dv.y <= 0,
  };
}

/**
 * ARREGLO POR CÓDIGO de mfd_main (provisional hasta corregirlo en Blender).
 *
 * Problema: el plano estaba orientado de espaldas al piloto (normal ≈ (0, −0.25, +0.97)):
 * con material de una cara sería invisible y la textura saldría espejada.
 *
 * Arreglo: girarlo 180° sobre su eje vertical (el eje local Z, a lo largo del cual varía v),
 * pasando por el centro de su geometría. Esa rotación diag(−1, −1, 1) invierte la normal
 * (la cara pasa a mirar al piloto) y también invierte u (la imagen deja de salir espejada),
 * mientras que v no cambia (arriba sigue siendo arriba).
 *
 * Además el plano flotaba 3.7 cm delante de la pantalla central de panel_front y era un 9 %
 * más pequeño, así que se centra y se escala sobre ella.
 *
 * ── Para hacerlo a mano en Blender ──
 *   1. Modo objeto, seleccionar mfd_main, R · Y · Y · 180 (gira sobre su eje Y local).
 *   2. (Opcional) centro en glTF (0.108, 0.6675, 6.4146) = Blender (0.108, −6.4146, 0.6675),
 *      y escala uniforme ≈ 0.0787 (la pantalla mide 0.157 m).
 *   3. Exportar y ejecutar `npm run inspect:glb`: debe decir "mira al piloto ✓" y
 *      "no espejada ✓". Entonces este arreglo ya no se ejecuta (o pon MFD_AUTOFIX = false).
 *
 * ── Alternativa sin tocar la geometría (descartada) ──
 *   Dejar el plano como está, material de doble cara y espejar la textura:
 *     material.side = THREE.DoubleSide;
 *     texture.repeat.x = -1; texture.offset.x = 1;
 *   Funciona, pero el raycast del MFD (fase 6) tendría que deshacer el espejo a mano.
 */
function fixMfd(mfd: THREE.Mesh, pilotPos: THREE.Vector3) {
  // 1) Giro de 180° sobre Z local alrededor del centro de la geometría: M' = M · T(c) · Rz(π) · T(−c)
  mfd.updateMatrix();
  mfd.geometry.computeBoundingBox();
  const c = mfd.geometry.boundingBox!.getCenter(new THREE.Vector3());
  const flip = new THREE.Matrix4()
    .makeTranslation(c.x, c.y, c.z)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  mfd.matrix.multiply(flip);
  mfd.matrix.decompose(mfd.position, mfd.quaternion, mfd.scale);

  // 2) Escala y posición sobre la pantalla central de panel_front.
  //    Medidas obtenidas con `npm run inspect:glb`: la pantalla va de x=0.029 a 0.187 (0.158 m)
  //    y su superficie pasa por (y, z) = (0.591, 6.396) y (0.743, 6.437), con normal
  //    (0, 0.2605, −0.9658). Se deja 2 mm por delante para evitar z-fighting.
  const SCREEN_CENTER = new THREE.Vector3(0.108, 0.667, 6.4165).addScaledVector(new THREE.Vector3(0, 0.2605, -0.9658), 0.002);
  const SCREEN_WIDTH = 0.157;
  const worldBox = () => new THREE.Box3().setFromObject(mfd); // actualiza la matriz mundo por sí misma
  const width = worldBox().getSize(new THREE.Vector3()).x; // el eje X no se ve afectado por la inclinación
  mfd.scale.multiplyScalar(SCREEN_WIDTH / width);
  mfd.position.add(SCREEN_CENTER.sub(worldBox().getCenter(new THREE.Vector3())));

  const o = orientation(mfd, pilotPos);
  console.info('[cabina] mfd_main corregido por código. Corrígelo en Blender (ver cockpit.ts).', o);
  if (!o.facesPilot || o.mirrored || o.upsideDown) console.warn('[cabina] mfd_main sigue mal orientado tras el arreglo:', o);
}

/**
 * Textura provisional del MFD: una rejilla con rótulos para comprobar a simple vista
 * que no sale espejada ni al revés. La fase 6 la sustituye por el contenido real.
 *
 * IMPORTANTE: flipY = false. glTF define v=0 en el borde SUPERIOR de la imagen, y los
 * CanvasTexture traen flipY=true por defecto (convención OpenGL, v=0 abajo). Con flipY=false,
 * la coordenada UV (u, v) del raycast se traduce al canvas directamente: x = u·ancho, y = v·alto.
 */
function createMfdPlaceholder() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#031208';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(141,255,160,.25)';
  g.lineWidth = 1;
  for (let i = 0; i <= S; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
  }
  g.strokeStyle = '#8dffa0';
  g.lineWidth = 4;
  g.strokeRect(6, 6, S - 12, S - 12);
  g.fillStyle = '#8dffa0';
  g.textAlign = 'center';
  g.font = "bold 44px 'B612 Mono', monospace";
  g.fillText('MFD', S / 2, S / 2 - 10);
  g.font = "24px 'B612 Mono', monospace";
  g.fillText('fase 6: contenido', S / 2, S / 2 + 28);
  g.textAlign = 'left';
  g.fillText('▲ ARRIBA', 20, 46);
  g.fillText('IZQ', 20, S - 20);
  g.textAlign = 'right';
  g.fillText('DER', S - 20, S - 20);
  // Un triángulo en la esquina (u,v) = (0,0): si lo ves arriba a la izquierda, la UV es correcta.
  g.beginPath(); g.moveTo(10, 60); g.lineTo(10, 110); g.lineTo(60, 60); g.closePath(); g.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // toneMapped:false → los colores del canvas llegan a pantalla tal cual, sin pasar por ACES.
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
}
