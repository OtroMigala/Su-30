import { setThrottleDir } from '../flight/scroll';
import { setMuted, unlockAudio } from '../audio/engine';
import { useFlight } from '../store/flight';

/**
 * Teclado global.
 *   W / S  acelerar hacia delante / atrás (mantener pulsada)
 *   M      silenciar el sonido
 *
 * Se usa KeyboardEvent.code (la tecla FÍSICA) y no .key (el carácter): en un teclado AZERTY la
 * tecla que ocupa el lugar de la W escribe "Z", pero su code sigue siendo "KeyW". Así el control
 * queda bajo los mismos dedos en cualquier distribución.
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
    } else if (e.code === 'KeyM' && !e.repeat) {
      const s = useFlight.getState();
      s.setMuted(!s.muted);
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

  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('blur', blur);
  addEventListener('pointerdown', gesture);
  return () => {
    unsub();
    removeEventListener('keydown', down);
    removeEventListener('keyup', up);
    removeEventListener('blur', blur);
    removeEventListener('pointerdown', gesture);
    blur();
  };
}
