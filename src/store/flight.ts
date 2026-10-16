import { create } from 'zustand';

// Máquina de estados de la cámara (CLAUDE.md): exterior → cockpit ⇄ free / focus.
// La fase 1 sólo usa exterior y cockpit; free y focus se activan en la fase 5.
export type CamMode = 'exterior' | 'cockpit' | 'free' | 'focus';

interface FlightState {
  /** Shaders compilados y modelo cargado: la pantalla de carga puede retirarse. */
  ready: boolean;
  camMode: CamMode;
  setReady: (ready: boolean) => void;
  setCamMode: (mode: CamMode) => void;
}

// Estado "reactivo": sólo lo que la interfaz HTML necesita redibujar (cambia pocas veces).
export const useFlight = create<FlightState>((set) => ({
  ready: false,
  camMode: 'exterior',
  setReady: (ready) => set({ ready }),
  setCamMode: (camMode) => set({ camMode }),
}));

// Estado "por fotograma": se muta directamente, NUNCA con setState dentro de useFrame.
// Un setState dispara re-renders de React; a 60 fps eso sería 60 renders por segundo.
// useFrame lee este objeto y listo, sin que React se entere.
export const rig = {
  /** Progreso de la entrada a la cabina: 0 = órbita exterior, 1 = sentado en cam_pilot. */
  enter: 0,
};
