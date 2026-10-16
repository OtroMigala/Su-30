import { create } from 'zustand';
import { createFlightState } from '../flight/route';

// Máquina de estados de la cámara (CLAUDE.md): exterior → cockpit ⇄ free / focus.
// Las fases 1 y 2 sólo usan exterior y cockpit; free y focus se activan en la fase 5.
export type CamMode = 'exterior' | 'cockpit' | 'free' | 'focus';

interface FlightStore {
  /** Shaders compilados y modelo cargado: la pantalla de carga puede retirarse. */
  ready: boolean;
  camMode: CamMode;
  /** Sección activa (waypoint más cercano, ya estabilizado). La leerán el HUD y el MFD. */
  section: number;
  /** Sonido silenciado (tecla M o botón). */
  muted: boolean;
  /** Cursor del menú tipo selector de armas (Q/E lo mueven, Enter vuela ahí). */
  menuSel: number;
  setReady: (ready: boolean) => void;
  setCamMode: (mode: CamMode) => void;
  setSection: (section: number) => void;
  setMuted: (muted: boolean) => void;
  setMenuSel: (i: number) => void;
}

// Estado "reactivo": sólo lo que la interfaz HTML necesita redibujar (cambia pocas veces).
// Los setters comparan antes de escribir: Zustand avisaría a los suscriptores aunque el valor
// fuera el mismo, y el scroll los llama muchas veces por segundo.
export const useFlight = create<FlightStore>((set, get) => ({
  ready: false,
  camMode: 'exterior',
  section: 0,
  muted: readMuted(),
  menuSel: 0,
  setReady: (ready) => set({ ready }),
  setCamMode: (camMode) => get().camMode !== camMode && set({ camMode }),
  // Al llegar a una sección, el cursor del menú salta a ella (como en el prototipo).
  setSection: (section) => get().section !== section && set({ section, menuSel: section }),
  setMenuSel: (menuSel) => get().menuSel !== menuSel && set({ menuSel }),
  setMuted: (muted) => {
    set({ muted });
    try {
      localStorage.setItem('su30.muted', muted ? '1' : '0');
    } catch {
      /* almacenamiento bloqueado (modo privado): sólo no se recuerda */
    }
  },
}));

/** La preferencia de silencio se recuerda entre visitas (si el navegador deja guardar). */
function readMuted() {
  try {
    return localStorage.getItem('su30.muted') === '1';
  } catch {
    return false;
  }
}

// Estado "por fotograma": se muta directamente, NUNCA con setState dentro de useFrame.
// Un setState dispara re-renders de React; a 60 fps eso sería 60 renders por segundo.
// useFrame lee este objeto y listo, sin que React se entere.
export const rig = {
  /** Progreso del scroll 0..1 (lo escribe ScrollTrigger). */
  progress: 0,
  /** Progreso de la entrada a la cabina: 0 = órbita exterior, 1 = sentado en cam_pilot. */
  enter: 0,
  /** Distancia objetivo en la ruta (m), según el scroll. */
  s: 0,
  /** Estado del vuelo (rumbo, alabeo, altitud...) que integra FlightDriver cada fotograma. */
  flight: createFlightState(0),
};
