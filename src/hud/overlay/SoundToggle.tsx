import { useFlight } from '../../store/flight';

/** Botón de sonido (equivale a la tecla M). aria-pressed indica a los lectores de pantalla si está activo. */
export function SoundToggle() {
  const muted = useFlight((s) => s.muted);
  const setMuted = useFlight((s) => s.setMuted);
  return (
    <button
      className="sound-btn"
      aria-pressed={!muted}
      aria-label="Sonido"
      title="Sonido (M)"
      onClick={() => setMuted(!muted)}
    >
      SND {muted ? 'OFF' : 'ON'}
    </button>
  );
}
