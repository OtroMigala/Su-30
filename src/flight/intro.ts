import gsap from 'gsap';
import { rig, useFlight } from '../store/flight';

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Anima `rig.enter` hasta 0 (salir) o 1 (entrar). GSAP interpola el número y la escena
 * lo lee cada fotograma. En la fase 2 el scroll (ScrollTrigger) tomará este mismo valor.
 */
export function playEntry(toCockpit: boolean) {
  const store = useFlight.getState();
  if (!toCockpit) store.setCamMode('exterior');
  gsap.to(rig, {
    enter: toCockpit ? 1 : 0,
    duration: prefersReducedMotion() ? 0.01 : 5,
    ease: 'power2.inOut',
    overwrite: true,
    onComplete: () => {
      if (toCockpit) useFlight.getState().setCamMode('cockpit');
    },
  });
}

// Ayuda para depurar sólo en desarrollo, para capturas reproducibles:
//   /?enter=0.5   punto de la entrada (0 = órbita, 1 = cabina)
//   &theta=-40    ángulo de la órbita en grados
//   &ly=16        altura (m) del punto que mira la cámara exterior, para alzar la vista al cielo
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  if (q.has('enter')) rig.enter = Number(q.get('enter'));
  if (rig.enter >= 1) useFlight.getState().setCamMode('cockpit');
}
