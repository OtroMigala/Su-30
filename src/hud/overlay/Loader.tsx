import { useProgress } from '@react-three/drei';
import { useFlight } from '../../store/flight';

/** Pantalla de carga: se retira cuando el modelo está cargado Y los shaders compilados. */
export function Loader() {
  const ready = useFlight((s) => s.ready);
  const progress = useProgress((s) => s.progress);
  return (
    <div className={`loader${ready ? ' done' : ''}`} role="status" aria-live="polite" aria-hidden={ready}>
      <div className="loader-text">{ready ? 'SISTEMAS LISTOS' : `INICIANDO SISTEMAS ${Math.round(progress)}%`}</div>
      <div className="loader-bar" aria-hidden="true">
        <div style={{ width: `${ready ? 100 : progress}%` }} />
      </div>
    </div>
  );
}
