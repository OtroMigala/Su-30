import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { rig, useFlight } from '../store/flight';
import { SNAP_STEP, progressForSection, scrollToFlight, sectionAt } from './route';

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Tiempo que la sección debe mantenerse estable antes de anunciarla (s), como en el prototipo:
 *  así un scroll rápido que cruza tres waypoints no dispara tres mensajes de radio. */
const SECTION_SETTLE = 0.18;

let trigger: ScrollTrigger | null = null;
let lenis: Lenis | null = null;

/**
 * Traduce el progreso del scroll al estado del vuelo. Corre en el callback de ScrollTrigger,
 * FUERA de useFrame, así que aquí sí se puede tocar el store reactivo (y sólo cambia cuando
 * de verdad cambia el valor: los setters lo comprueban).
 */
function applyProgress(P: number) {
  rig.progress = P;
  const { enter, s } = scrollToFlight(P);
  rig.enter = enter;
  rig.s = s;
  // Fase 5: free y focus no se pisarán; de momento sólo exterior ⇄ cockpit.
  const mode = useFlight.getState().camMode;
  if (mode === 'exterior' || mode === 'cockpit') {
    useFlight.getState().setCamMode(enter >= 0.999 ? 'cockpit' : 'exterior');
  }
}

/**
 * Monta Lenis + ScrollTrigger sobre el contenedor alto `track` y devuelve la función que lo
 * desmonta (React StrictMode monta, desmonta y vuelve a montar los efectos en desarrollo).
 *
 * Cómo encajan las piezas:
 *  · El navegador hace el scroll real de la ventana sobre un <div> muy alto e invisible.
 *  · Lenis intercepta la rueda y mueve ese scroll con una interpolación suave (por fotograma,
 *    scroll ← scroll + (objetivo − scroll)·lerp), en lugar de los saltos de ~100 px de la rueda.
 *  · ScrollTrigger mide el scroll dentro del contenedor y lo convierte en progress ∈ [0, 1].
 *  · El snap: cuando el scroll se detiene, ScrollTrigger lo lleva al múltiplo de 1/N más cercano,
 *    es decir, al waypoint (o al exterior) más próximo. Se dispara tras `delay` sin scroll, cuando
 *    Lenis ya está quieto, así que no se pelean por la posición.
 */
export function initScroll(track: HTMLElement) {
  const reduced = prefersReducedMotion();

  // Recargar la página debe empezar en el exterior, no donde el navegador recuerde.
  history.scrollRestoration = 'manual';

  // Con prefers-reduced-motion no hay suavizado: el scroll nativo va directo a la escena.
  if (!reduced) {
    lenis = new Lenis({ autoRaf: false, lerp: 0.09 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(lenisRaf);
    // GSAP por defecto "absorbe" los saltos de tiempo grandes (lagSmoothing); con Lenis eso
    // haría que el scroll se frenara tras una pestaña en segundo plano.
    gsap.ticker.lagSmoothing(0);
  }

  let settleTimer = 0;
  trigger = ScrollTrigger.create({
    trigger: track,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      applyProgress(self.progress);
      // Sección estable: se anuncia cuando lleva SECTION_SETTLE s sin cambiar.
      const next = sectionAt(self.progress);
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => useFlight.getState().setSection(next), SECTION_SETTLE * 1000);
    },
    snap: {
      snapTo: SNAP_STEP,
      duration: reduced ? { min: 0, max: 0 } : { min: 0.4, max: 1.2 },
      delay: 0.25,
      ease: 'power2.inOut',
      inertia: false, // sin "inercia": el snap va al punto más cercano, no al que apunta el gesto
    },
  });

  window.scrollTo(0, 0);
  applyProgress(trigger.progress);

  // Depuración sólo en desarrollo: /?p=0.5 (progreso del scroll) o /?sec=2 (waypoint 2).
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    const P = q.has('sec') ? progressForSection(Number(q.get('sec'))) : q.has('p') ? Number(q.get('p')) : null;
    if (P !== null) requestAnimationFrame(() => scrollToProgress(P, true));
  }

  return () => {
    clearTimeout(settleTimer);
    trigger?.kill();
    trigger = null;
    if (lenis) {
      gsap.ticker.remove(lenisRaf);
      lenis.destroy();
      lenis = null;
    }
  };
}

// gsap.ticker da el tiempo en segundos; Lenis lo quiere en milisegundos.
function lenisRaf(time: number) {
  lenis?.raf(time * 1000);
}

/** Lleva el scroll al progreso P (0..1). */
export function scrollToProgress(P: number, immediate = false) {
  if (!trigger) return;
  const y = trigger.start + (trigger.end - trigger.start) * P;
  if (lenis) lenis.scrollTo(y, { immediate, duration: 2.2 });
  else window.scrollTo({ top: y, behavior: 'auto' });
}

/** Vuela al waypoint i (lo usarán el menú y el teclado en la fase 3). */
export function goToSection(i: number) {
  scrollToProgress(progressForSection(i), prefersReducedMotion());
}
