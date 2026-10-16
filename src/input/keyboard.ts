import { goToSection, setThrottleDir } from '../flight/scroll';
import { N } from '../flight/route';
import { initLook, release, toggleFree } from './look';
import { setMuted, unlockAudio } from '../audio/engine';
import { useFlight } from '../store/flight';

/**
 * Teclado global.
 *   W / S  acelerar hacia delante / atrás (mantener pulsada)
 *   Q / E  mover el cursor del menú de secciones · Enter: volar a la sección elegida
 *   1 … 6  volar directamente a una sección
 *   F      vista libre (mirar alrededor) · Esc: soltar la cabeza / salir del MFD
 *   M      silenciar el sonido
 *
 * Se usa KeyboardEvent.code (la tecla FÍSICA) y no .key (el carácter): en un teclado AZERTY la
 * tecla que ocupa el lugar de la W escribe "Z", pero su code sigue siendo "KeyW". Así el control
 * queda bajo los mismos dedos en cualquier distribución. Con los números pasa algo parecido: en
 * AZERTY hay que pulsar Mayús para escribir "1", pero code = "Digit1" sin Mayús.
 */
export function initKeyboard() {
  const held = new Set<string>();
  const update = () => setThrottleDir((held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0));

  // Aplica el silencio guardado y lo sigue al cambiar en el store (tecla o botón).
  setMuted(useFlight.getState().muted);
  const unsub = useFlight.subscribe((s, prev) => s.muted !== prev.muted && setMuted(s.muted));

  const editable = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  const down = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
    unlockAudio(); // una tecla es un "gesto de usuario": ya se puede crear el AudioContext
    if (e.code === 'KeyW' || e.code === 'KeyS') {
      e.preventDefault();
      held.add(e.code); // la autorrepetición del teclado no cambia nada: es un Set
      update();
      return;
    }
    if (e.repeat) return;
    const s = useFlight.getState();
    if (e.code === 'KeyM') s.setMuted(!s.muted);
    else if (e.code === 'KeyF') toggleFree();
    else if (e.code === 'Escape') release();
    // Q/E: el cursor da la vuelta (módulo N). Sumar N antes del % evita restos negativos en JS.
    else if (e.code === 'KeyQ') s.setMenuSel((s.menuSel + N - 1) % N);
    else if (e.code === 'KeyE') s.setMenuSel((s.menuSel + 1) % N);
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // Con el foco en un botón o enlace, Enter ya lo activa el navegador: no lo duplicamos.
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
      goToSection(s.menuSel);
    } else {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m && Number(m[1]) <= N) goToSection(Number(m[1]) - 1);
    }
  };
  const up = (e: KeyboardEvent) => {
    if (held.delete(e.code)) update();
  };
  // Si la ventana pierde el foco con la tecla pulsada, nunca llega el keyup: se suelta todo.
  const blur = () => {
    held.clear();
    update();
  };
  const gesture = () => unlockAudio();
  const stopLook = initLook();

  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('blur', blur);
  addEventListener('pointerdown', gesture);
  return () => {
    stopLook();
    unsub();
    removeEventListener('keydown', down);
    removeEventListener('keyup', up);
    removeEventListener('blur', blur);
    removeEventListener('pointerdown', gesture);
    blur();
  };
}
