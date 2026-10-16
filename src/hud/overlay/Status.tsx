import { useEffect, useRef } from 'react';
import { useFlight } from '../../store/flight';
import { CONTENT } from '../../data/content';

const pad = (n: number) => String(n).padStart(2, '0');

/** Bloque de estado (arriba a la izquierda): tiempo de misión, piloto y waypoint activo. */
export function Status() {
  const section = useFlight((s) => s.section);
  const time = useRef<HTMLElement>(null);

  // El reloj se escribe directamente en el DOM una vez por segundo: no hace falta que React
  // vuelva a pintar el bloque entero para cambiar seis dígitos.
  useEffect(() => {
    const t0 = performance.now();
    const tick = () => {
      const t = Math.floor((performance.now() - t0) / 1000);
      if (time.current) time.current.textContent = `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="status glow" aria-hidden="true">
      <div>
        TIME <b ref={time}>00:00:00</b>
      </div>
      <div>
        PILOT <b>{`${CONTENT.pilot} "${CONTENT.callsign}"`}</b>
      </div>
      <div>
        WPT <b>{`${pad(section)} ${CONTENT.sections[section]!.code}`}</b>
      </div>
    </div>
  );
}
