import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { rig, useFlight } from '../store/flight';
import { SNAP_STEP, clamp, damp, progressForSection, scrollToFlight, sectionAt } from './route';
import { setThrottle as setEngineSound } from '../audio/engine';

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Tiempo que la sección debe mantenerse estable antes de anunciarla (s), como en el prototipo:
 *  así un scroll rápido que cruza tres waypoints no dispara tres mensajes de radio. */
const SECTION_SETTLE = 0.18;

let trigger: ScrollTrigger | null = null;
let reducedMotion = false;
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
  // Salir de la cabina (aunque sea un poco) vuelve al exterior desde cualquier modo; al llegar a
  // la cabina desde fuera se entra en 'cockpit'. Dentro, free y focus se respetan.
  const store = useFlight.getState();
  if (enter < 0.999) store.setCamMode('exterior');
  else if (store.camMode === 'exterior') store.setCamMode('cockpit');
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
  reducedMotion = reduced;

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

  gsap.ticker.add(throttleTick);
  // La rueda o el dedo cancelan el planeo automático al soltar W/S y el vuelo automático del
  // menú (Lenis lo interrumpe sin llamar a onComplete, así que aquí también se apaga el motor).
  const userScroll = () => {
    cancelGlide();
    if (throttleDir === 0) setEngineSound(false);
  };
  addEventListener('wheel', userScroll, { passive: true });
  addEventListener('touchstart', userScroll, { passive: true });

  // Depuración sólo en desarrollo: /?p=0.5 (progreso del scroll) o /?sec=2 (waypoint 2).
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    const P = q.has('sec') ? progressForSection(Number(q.get('sec'))) : q.has('p') ? Number(q.get('p')) : null;
    if (P !== null) requestAnimationFrame(() => scrollToProgress(P, true));
  }

  return () => {
    gsap.ticker.remove(throttleTick);
    removeEventListener('wheel', userScroll);
    removeEventListener('touchstart', userScroll);
    cancelGlide();
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

/** Lleva el scroll al progreso P (0..1). `onDone` se llama al llegar. */
export function scrollToProgress(P: number, immediate = false, onDone?: () => void) {
  if (!trigger) return;
  const y = trigger.start + (trigger.end - trigger.start) * P;
  if (lenis && !immediate) lenis.scrollTo(y, { duration: 2.2, force: true, onComplete: onDone });
  else {
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo({ top: y, behavior: 'auto' });
    onDone?.();
  }
}

// ---------------------------------------------------------------------------
// Acelerador W/S
// ---------------------------------------------------------------------------
//
// W y S no "pilotan" el avión: mueven el MISMO scroll que la rueda. Así todo lo demás (ruta,
// snap, secciones) funciona igual venga de donde venga la orden.
//
// Mientras la tecla está pulsada, la velocidad (en progreso de scroll por segundo) tiende a la de
// crucero con un filtro de primer orden, dv/dt = λ·(v_crucero − v): el avión acelera rápido al
// principio y cada vez más despacio, como un motor que sube de vueltas. Es el mismo damp de
// route.ts. La posición es la integral de la velocidad: P ← P + v·dt (integración de Euler).

/** Velocidad de crucero: un tramo (14 km) cada 3.5 s. */
const CRUISE = SNAP_STEP / 3.5;
/** λ de la aceleración (1/s): ~95 % de la velocidad de crucero en 3/λ ≈ 1.7 s, en sintonía con
 *  el sonido de arranque, cuyo encendido llega a pleno régimen hacia el segundo 1. */
const SPOOL_LAMBDA = 1.8;

let throttleDir = 0; // +1 avanzar (W), −1 retroceder (S), 0 suelto
let velocity = 0; // progreso/s, con signo
let position = 0; // progreso que escribe el acelerador
let glide: gsap.core.Tween | null = null;
const glideProxy = { p: 0 };

function setScroll(P: number) {
  if (!trigger) return;
  const y = trigger.start + (trigger.end - trigger.start) * clamp(P, 0, 1);
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}

function cancelGlide() {
  if (!glide) return;
  glide.kill();
  glide = null;
  velocity = 0;
}

/** Lo llama el teclado: dir = +1 (W), −1 (S) o 0 (ninguna pulsada). */
export function setThrottleDir(dir: number) {
  if (dir === throttleDir) return;
  const wasIdle = throttleDir === 0;
  throttleDir = dir;
  setEngineSound(dir !== 0);
  if (dir !== 0) {
    if (wasIdle) {
      // Se retoma desde donde esté el scroll (pudo moverlo la rueda o un planeo).
      if (glide) {
        glide.kill();
        glide = null;
      } else velocity = 0;
      position = rig.progress;
    }
    return;
  }
  glideToWaypoint();
}

/**
 * Al soltar, el avión NO retrocede: sigue hasta el siguiente waypoint en la dirección en que iba
 * y se detiene con deceleración constante. Cinemática del MRUV: partiendo a v₀ y frenando hasta 0
 * en una distancia d, la velocidad media es v₀/2, así que tarda T = 2d / v₀. La curva 'power1.out'
 * de GSAP, x(t) = 1 − (1 − t)², es justo esa parábola: pendiente inicial 2·d/T = v₀ y final 0.
 * Por eso la transición entre "acelerador" y "planeo" no tiene saltos de velocidad.
 */
function glideToWaypoint() {
  const v = velocity;
  if (Math.abs(v) < 1e-4) {
    velocity = 0;
    return;
  }
  const eps = 1e-4; // si ya estás encima de un waypoint, cuenta como alcanzado
  const k = position / SNAP_STEP;
  const target = clamp((v > 0 ? Math.ceil(k - eps) : Math.floor(k + eps)) * SNAP_STEP, 0, 1);
  const d = Math.abs(target - position);
  if (d < 1e-6 || reducedMotion) {
    setScroll(target);
    velocity = 0;
    return;
  }
  glideProxy.p = position;
  glide = gsap.to(glideProxy, {
    p: target,
    duration: clamp((2 * d) / Math.abs(v), 0.25, 5),
    ease: 'power1.out',
    onUpdate: () => {
      position = glideProxy.p;
      setScroll(position);
    },
    onComplete: () => {
      glide = null;
      velocity = 0;
    },
  });
}

function throttleTick(_time: number, deltaMs: number) {
  if (throttleDir === 0) return;
  const dt = Math.min(deltaMs / 1000, 0.05);
  // Con prefers-reduced-motion no hay "spool": velocidad de crucero inmediata.
  velocity = reducedMotion ? throttleDir * CRUISE : damp(velocity, throttleDir * CRUISE, SPOOL_LAMBDA, dt);
  position = clamp(position + velocity * dt, 0, 1);
  if (position === 0 || position === 1) velocity = 0; // tope de la ruta
  setScroll(position);
}

/**
 * Vuela al waypoint i (menú, Enter, teclas 1–6). Es un vuelo automático: suena el motor
 * mientras dura y se apaga al llegar (salvo que el usuario esté acelerando con W/S).
 */
export function goToSection(i: number) {
  const P = progressForSection(i);
  cancelGlide();
  const far = Math.abs(P - rig.progress) > 1e-3;
  if (far && !reducedMotion) setEngineSound(true);
  scrollToProgress(P, reducedMotion, () => {
    if (throttleDir === 0) setEngineSound(false);
  });
}
