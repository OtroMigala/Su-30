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
  setReady: (ready: boolean) => void;
  setCamMode: (mode: CamMode) => void;
  setSection: (section: number) => void;
}

// Estado "reactivo": sólo lo que la interfaz HTML necesita redibujar (cambia pocas veces).
// Los setters comparan antes de escribir: Zustand avisaría a los suscriptores aunque el valor
// fuera el mismo, y el scroll los llama muchas veces por segundo.
export const useFlight = create<FlightStore>((set, get) => ({
  ready: false,
  camMode: 'exterior',
  section: 0,
  setReady: (ready) => set({ ready }),
  setCamMode: (camMode) => get().camMode !== camMode && set({ camMode }),
  setSection: (section) => get().section !== section && set({ section }),
}));

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
