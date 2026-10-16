import { useFlight } from '../../store/flight';
import { release, toggleFree } from '../../input/look';

/**
 * Indicadores y controles de la cámara de cabina:
 *  · "HEAD FREE" (ámbar) mientras la vista libre está activa, como en el prototipo.
 *  · Botón MIRAR (sólo en pantallas estrechas, donde no hay tecla F) y, frente al MFD, VOLVER
 *    (que además recuerda la tecla Esc).
 */
export function LookControls() {
  const mode = useFlight((s) => s.camMode);
  const free = mode === 'free';
  const focus = mode === 'focus';
  return (
    <>
      <div className={`looktag${free ? ' on' : ''}`} aria-hidden="true">
        HEAD FREE
      </div>
      <button className="lookbtn" aria-pressed={free} onClick={toggleFree}>
        MIRAR
      </button>
      {focus && (
        <button className="lookbtn backbtn" onClick={release}>
          VOLVER · ESC
        </button>
      )}
    </>
  );
}
