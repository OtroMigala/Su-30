import { create } from 'zustand';
import { createFlightState } from '../flight/route';
import type { ManualInput, ManualState } from '../flight/manual';

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
  /** Contacto de radar elegido (página RDR del MFD). */
  selContact: number;
  /** Página del MFD dentro de la sección (SISTEMA, CONSTRUIDO CON...). Vuelve a 0 al cambiar de sección. */
  mfdPage: number;
  /** Objetivo fijado con el cursor (−1 = ninguno). */
  lockId: number;
  /** DCL: HUD simplificado (sin escalera de cabeceo). */
  declutter: boolean;
  /** D/N: cielo nocturno o de amanecer (como el tema claro/oscuro del prototipo). */
  theme: 'night' | 'dawn';
  /** Calidad gráfica: la baja PerformanceMonitor si los fps caen. */
  quality: 'high' | 'low';
  /** Quién vuela: el scroll ('auto'), el usuario ('manual') o el autopiloto volviendo a la ruta. */
  pilot: 'auto' | 'manual' | 'return';
  /** Aviso activo en vuelo manual: fuera del área o Auto-GCAS. */
  alert: '' | 'area' | 'gcas';
  setReady: (ready: boolean) => void;
  setCamMode: (mode: CamMode) => void;
  setSection: (section: number) => void;
  setMuted: (muted: boolean) => void;
  setMenuSel: (i: number) => void;
  setSelContact: (i: number) => void;
  setMfdPage: (p: number) => void;
  setLockId: (i: number) => void;
  setDeclutter: (on: boolean) => void;
  setTheme: (t: 'night' | 'dawn') => void;
  setQuality: (q: 'high' | 'low') => void;
  setPilot: (p: 'auto' | 'manual' | 'return') => void;
  setAlert: (a: '' | 'area' | 'gcas') => void;
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
  selContact: 0,
  mfdPage: 0,
  lockId: -1,
  declutter: false,
  theme: 'night',
  quality: 'high',
  pilot: 'auto',
  alert: '',
  setReady: (ready) => set({ ready }),
  setCamMode: (camMode) => get().camMode !== camMode && set({ camMode }),
  // Al llegar a una sección, el cursor del menú salta a ella (como en el prototipo).
  setSection: (section) => get().section !== section && set({ section, menuSel: section, mfdPage: 0 }),
  setMenuSel: (menuSel) => get().menuSel !== menuSel && set({ menuSel }),
  setSelContact: (selContact) => get().selContact !== selContact && set({ selContact }),
  setMfdPage: (mfdPage) => get().mfdPage !== mfdPage && set({ mfdPage }),
  setLockId: (lockId) => get().lockId !== lockId && set({ lockId }),
  setDeclutter: (declutter) => set({ declutter }),
  setTheme: (theme) => set({ theme }),
  setQuality: (quality) => get().quality !== quality && set({ quality }),
  setPilot: (pilot) => get().pilot !== pilot && set({ pilot }),
  setAlert: (alert) => get().alert !== alert && set({ alert }),
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
  /** Vuelo manual: estado de la física (null en ruta), mandos del teclado y bandera de "alineado
   *  con la ruta" que levanta useFrame para que el vigilante haga el traspaso. */
  manual: null as ManualState | null,
  input: { roll: 0, pitch: 0, throttle: 0 } as ManualInput,
  returnDone: false,
};
