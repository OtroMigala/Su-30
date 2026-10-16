// Vista libre (tecla F / botón MIRAR) y transiciones entre los modos de cámara de la cabina.
//
// Con ratón, la POSICIÓN absoluta del cursor dicta hacia dónde mira la cabeza (como en el
// prototipo): el borde derecho de la ventana = 75° a la derecha, el borde superior = 35° arriba.
// Se descartó el pointer lock (mirada relativa tipo videojuego de disparos) porque captura el
// cursor y entonces no se podría pulsar el menú ni el MFD mientras miras.
//
// Con el dedo no hay "posición del cursor": se usa el ARRASTRE relativo (como girar una foto 360°).

import { rig, useFlight, type CamMode } from '../store/flight';

export const LOOK_YAW = 75;
export const LOOK_PITCH = 35;
/** Grados que gira la cabeza al arrastrar el dedo una ventana entera de ancho. */
const DRAG_DEG = 160;

const store = () => useFlight.getState();
const inCockpit = (m: CamMode) => m !== 'exterior';

function center() {
  rig.look.tYaw = 0;
  rig.look.tPitch = 0;
}

/** F / botón MIRAR: alterna la vista libre (sólo dentro de la cabina). */
export function toggleFree() {
  const m = store().camMode;
  if (!inCockpit(m)) return;
  if (m === 'free') release();
  else store().setCamMode('free');
}

/** Esc: suelta la cabeza y sale del MFD, de vuelta a la vista normal. */
export function release() {
  const m = store().camMode;
  if (!inCockpit(m)) return;
  center();
  store().setCamMode('cockpit');
}

export function enterFocus() {
  if (!inCockpit(store().camMode)) return;
  center();
  store().setCamMode('focus');
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Escucha el puntero para la vista libre. Devuelve la función que deja de escuchar.
 * Sólo actúa en modo 'free'; en el resto de modos no toca nada.
 */
export function initLook() {
  let drag: { id: number; x: number; y: number } | null = null;

  const move = (e: PointerEvent) => {
    if (store().camMode !== 'free') return;
    if (e.pointerType === 'mouse') {
      // Posición normalizada a [−1, 1] en cada eje → ángulo objetivo.
      rig.look.tYaw = (e.clientX / innerWidth - 0.5) * 2 * LOOK_YAW;
      rig.look.tPitch = -(e.clientY / innerHeight - 0.5) * 2 * LOOK_PITCH;
    } else if (drag && e.pointerId === drag.id) {
      // Arrastrar a la izquierda gira la cabeza a la derecha: el mundo "se arrastra" con el dedo.
      rig.look.tYaw = clamp(rig.look.tYaw - ((e.clientX - drag.x) / innerWidth) * DRAG_DEG, -LOOK_YAW, LOOK_YAW);
      rig.look.tPitch = clamp(rig.look.tPitch + ((e.clientY - drag.y) / innerHeight) * DRAG_DEG * 0.6, -LOOK_PITCH, LOOK_PITCH);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  };
  const down = (e: PointerEvent) => {
    if (store().camMode === 'free' && e.pointerType !== 'mouse') drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };

  // En vista libre con el dedo, el arrastre es para mirar y no debe hacer scroll (que movería el
  // avión): touch-action: none en el body mientras dure (ver index.css, body.looking).
  const unsub = useFlight.subscribe((s, prev) => {
    if (s.camMode === prev.camMode) return;
    document.body.classList.toggle('looking', s.camMode === 'free');
    if (s.camMode !== 'free') drag = null;
  });

  addEventListener('pointermove', move);
  addEventListener('pointerdown', down);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  return () => {
    unsub();
    removeEventListener('pointermove', move);
    removeEventListener('pointerdown', down);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    document.body.classList.remove('looking');
  };
}
