// Picking: qué objeto 3D hay bajo el cursor (o bajo el dedo).
//
// Un registro pequeño en lugar de los eventos de R3F: R3F lanzaría el rayo contra TODA la escena
// (27 000 triángulos del avión) en cada movimiento del ratón. Aquí sólo se prueban los objetos
// registrados (la pantalla del MFD: 2 triángulos; cada objetivo: un sprite), y gana el más cercano.
//
// Un raycast convierte el píxel en un rayo: el píxel pasa a coordenadas normalizadas del
// dispositivo (NDC, de −1 a 1 en cada eje, y hacia arriba), y la inversa de la matriz de
// proyección de la cámara lo "desproyecta" a una dirección 3D que sale del ojo.

import * as THREE from 'three';
import { useFlight } from '../store/flight';
import { release } from './look';

export interface Pickable {
  /** Clic sobre el objeto. */
  onClick?: (hit: THREE.Intersection) => void;
  /** El cursor entra o se mueve sobre el objeto (hit) o lo abandona (null). Devuelve true si debe
   *  mostrarse la mano de "pulsable". */
  onHover?: (hit: THREE.Intersection | null) => boolean;
}

const items = new Map<THREE.Object3D, Pickable>();
let hovered: THREE.Object3D | null = null;

export function addPickable(obj: THREE.Object3D, p: Pickable) {
  items.set(obj, p);
  return () => {
    items.delete(obj);
    if (hovered === obj) hovered = null;
  };
}

export function initPicking(camera: THREE.Camera, el: HTMLElement) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const active = () => useFlight.getState().camMode !== 'exterior';

  const pick = (e: MouseEvent) => {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); // también fija ray.camera, que los Sprite necesitan
    const objs = [...items.keys()].filter((o) => o.visible);
    return ray.intersectObjects(objs, false)[0] ?? null; // ordenados por distancia
  };

  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const hit = active() ? pick(e) : null;
    const obj = hit?.object ?? null;
    if (hovered && hovered !== obj) items.get(hovered)?.onHover?.(null);
    hovered = obj;
    const pointer = obj ? (items.get(obj)?.onHover?.(hit) ?? true) : false;
    el.style.cursor = pointer ? 'pointer' : '';
  };

  // 'click' y no 'pointerup': el navegador no lo dispara si el puntero se arrastró (p. ej. al
  // mirar alrededor con el dedo), así que un arrastre no cuenta como clic.
  const click = (e: MouseEvent) => {
    if (!active() || e.button !== 0) return;
    const hit = pick(e);
    if (hit) items.get(hit.object)?.onClick?.(hit);
    else if (useFlight.getState().camMode === 'focus') release(); // clic fuera del MFD: volver
  };

  el.addEventListener('pointermove', move);
  el.addEventListener('click', click);
  return () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('click', click);
    el.style.cursor = '';
  };
}
