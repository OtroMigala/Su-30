import { create } from 'zustand';
import { createFlightState } from '../flight/route';

// Máquina de estados de la cámara (CLAUDE.md):
//   exterior ──(scroll entra)──► cockpit ──F──► free ──F/Esc──► cockpit
//                                   └──clic en el MFD──► focus ──Esc/clic fuera──► cockpit
// Salir de la cabina con el scroll lleva a exterior desde cualquier estado.
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
  /** Proyecto cuya ficha muestra el MFD. */
  selProject: number;
  /** Objetivo fijado con el cursor (−1 = ninguno). */
  lockId: number;
  /** DCL: HUD simplificado (sin escalera de cabeceo). */
  declutter: boolean;
  /** D/N: cielo nocturno o de amanecer (como el tema claro/oscuro del prototipo). */
  theme: 'night' | 'dawn';
  setReady: (ready: boolean) => void;
  setCamMode: (mode: CamMode) => void;
  setSection: (section: number) => void;
  setMuted: (muted: boolean) => void;
  setMenuSel: (i: number) => void;
  setSelProject: (i: number) => void;
  setLockId: (i: number) => void;
  setDeclutter: (on: boolean) => void;
  setTheme: (t: 'night' | 'dawn') => void;
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
  selProject: 0,
  lockId: -1,
  declutter: false,
  theme: 'night',
  setReady: (ready) => set({ ready }),
  setCamMode: (camMode) => get().camMode !== camMode && set({ camMode }),
  // Al llegar a una sección, el cursor del menú salta a ella (como en el prototipo).
  setSection: (section) => get().section !== section && set({ section, menuSel: section }),
  setMenuSel: (menuSel) => get().menuSel !== menuSel && set({ menuSel }),
  setSelProject: (selProject) => get().selProject !== selProject && set({ selProject }),
  setLockId: (lockId) => get().lockId !== lockId && set({ lockId }),
  setDeclutter: (declutter) => set({ declutter }),
  setTheme: (theme) => set({ theme }),
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
  /** Cabeza del piloto en vista libre (grados): valor actual suavizado y objetivo. */
  look: { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0 },
  /** Transición al MFD: 0 = ojos del piloto, 1 = cámara frente a la pantalla. */
  focus: 0,
  /** Mezcla del tema del cielo: 0 = noche, 1 = amanecer (D/N en el MFD). La suaviza Sky.tsx. */
  dawn: 0,
};
