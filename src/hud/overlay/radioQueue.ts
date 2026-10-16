// Radio: cola de mensajes con efecto de máquina de escribir (portado del prototipo).
//
// Es un módulo imperativo, no estado de React: la escritura cambia el texto ~35 veces por
// segundo y no tiene sentido re-renderizar un componente por cada letra. El componente <Radio>
// sólo registra aquí sus nodos del DOM (bindRadio) y este módulo escribe en ellos.
//
// Accesibilidad: el texto que se va escribiendo es aria-hidden. Si estuviera en la región
// aria-live, el lector de pantalla anunciaría cada fragmento ("Bien", "Bienve", "Bienvenido"...).
// En su lugar, una región aria-live aparte (visualmente oculta) recibe el mensaje COMPLETO una
// sola vez, al empezar a escribirse.

import { prefersReducedMotion } from '../../flight/scroll';

interface RadioView {
  root: HTMLElement;
  who: HTMLElement;
  msg: HTMLElement;
  live: HTMLElement;
}

/** Caracteres por paso y milisegundos entre pasos: 2 / 28 ms ≈ 70 caracteres por segundo. */
const STEP_CHARS = 2;
const STEP_MS = 28;

let view: RadioView | null = null;
let queue: [string, string][] = [];
let busy = false;
let timer = 0;

export function bindRadio(v: RadioView | null) {
  view = v;
  if (!v) {
    clearTimeout(timer);
    busy = false;
  } else if (queue.length && !busy) next();
}

/**
 * Encola un mensaje. Con `now`, vacía la cola e interrumpe el actual: un mensaje nuevo de una
 * sección sustituye al anterior en vez de esperar a que termine.
 */
export function radio(who: string, text: string, now = false) {
  if (now) {
    queue = [];
    busy = false;
    clearTimeout(timer);
  }
  queue.push([who, text]);
  if (!busy) next();
}

function next() {
  if (!view) return;
  const m = queue.shift();
  if (!m) {
    busy = false;
    view.root.classList.add('idle');
    return;
  }
  busy = true;
  const [who, text] = m;
  view.root.classList.remove('idle');
  view.who.textContent = who;
  view.live.textContent = `${who}: ${text}`;
  const reduced = prefersReducedMotion();
  let i = 0;
  const type = () => {
    if (!view) return;
    i = reduced ? text.length : i + STEP_CHARS;
    view.msg.textContent = text.slice(0, i);
    // Tiempo de lectura tras terminar de escribir: ~55 ms por carácter, mínimo 3.5 s.
    if (i < text.length) timer = window.setTimeout(type, STEP_MS);
    else timer = window.setTimeout(next, Math.max(3500, text.length * 55));
  };
  type();
}
