import { goToSection, setThrottleDir } from '../flight/scroll';
import { N } from '../flight/route';
import { initLook, release, toggleFree } from './look';
import { setMuted, unlockAudio } from '../audio/engine';
import { rig, useFlight } from '../store/flight';
import { initAutopilot, takeover, toggleAutopilot } from '../flight/autopilot';
import { setThrottle as setEngineSound } from '../audio/engine';

/**
 * Teclado global.
 * En ruta (piloto automático):
 *   W / S  acelerar hacia delante / atrás (mantener pulsada)
 *   Q / E  mover el cursor del menú de secciones · Enter: volar a la sección elegida
 *   1 … 6  volar directamente a una sección
 *   F      vista libre (mirar alrededor) · Esc: soltar la cabeza / salir del MFD
 *   M      silenciar el sonido
 *   P      piloto automático: desconectar (vuelo manual) / conectar (vuelve a la ruta)
 * En vuelo manual (esquema "Expert" de Ace Combat):
 *   W / S  palanca adelante (nariz abajo) / atrás (nariz arriba) · A / D  alabeo
 *   Space  acelerar · Shift  aerofreno
 *   Tocar W/A/S/D mientras el autopiloto vuelve a la ruta devuelve el mando al usuario.
 *
 * (Ctrl NO se usa para frenar: Ctrl+W cierra la pestaña y la página no puede impedirlo.)
 *
 * Se usa KeyboardEvent.code (la tecla FÍSICA) y no .key (el carácter): en un teclado AZERTY la
 * tecla que ocupa el lugar de la W escribe "Z", pero su code sigue siendo "KeyW". Así el control
 * queda bajo los mismos dedos en cualquier distribución. Con los números pasa algo parecido: en
 * AZERTY hay que pulsar Mayús para escribir "1", pero code = "Digit1" sin Mayús.
 */
export function initKeyboard() {
  const held = new Set<string>();
  const k = (c: string) => (held.has(c) ? 1 : 0);
  // Reparte las teclas pulsadas según quién vuela. Se llama en cada pulsación/suelta y al cambiar
  // de modo, así una tecla que se mantiene pulsada durante el cambio pasa a significar lo nuevo.
  const update = () => {
    const pilot = useFlight.getState().pilot;
    if (pilot === 'auto') {
      setThrottleDir(k('KeyW') - k('KeyS'));
      rig.input.roll = rig.input.pitch = rig.input.throttle = 0;
      return;
    }
    setThrottleDir(0);
    rig.input.roll = k('KeyD') - k('KeyA');
    rig.input.pitch = k('KeyS') - k('KeyW'); // S tira (nariz arriba), W empuja (nariz abajo)
    rig.input.throttle = k('Space') - Math.max(k('ShiftLeft'), k('ShiftRight'));
    if (pilot === 'manual') setEngineSound(rig.input.throttle > 0);
  };
  const FLIGHT_KEYS = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']);

  // Aplica el silencio guardado y lo sigue al cambiar en el store (tecla o botón).
  setMuted(useFlight.getState().muted);
  const unsub = useFlight.subscribe((s, prev) => {
    if (s.muted !== prev.muted) setMuted(s.muted);
    if (s.pilot !== prev.pilot) update();
  });

  const editable = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  const down = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || editable(e.target)) return;
    unlockAudio(); // una tecla es un "gesto de usuario": ya se puede crear el AudioContext
    const pilot = useFlight.getState().pilot;
    if (e.code === 'KeyW' || e.code === 'KeyS' || (pilot !== 'auto' && FLIGHT_KEYS.has(e.code))) {
      e.preventDefault(); // Space haría scroll de la página
      held.add(e.code); // la autorrepetición del teclado no cambia nada: es un Set
      if (pilot === 'return' && /^Key[WASD]$/.test(e.code)) takeover();
      update();
      return;
    }
    if (e.repeat) return;
    const s = useFlight.getState();
    if (e.code === 'KeyM') s.setMuted(!s.muted);
    else if (e.code === 'KeyP') toggleAutopilot();
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
  const stopAutopilot = initAutopilot();

  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('blur', blur);
  addEventListener('pointerdown', gesture);
  return () => {
    stopAutopilot();
    stopLook();
    unsub();
    removeEventListener('keydown', down);
    removeEventListener('keyup', up);
    removeEventListener('blur', blur);
    removeEventListener('pointerdown', gesture);
    blur();
  };
}
