import { useEffect, useRef } from 'react';
import { rig, useFlight } from '../../store/flight';
import { loadFactor, norm360, N } from '../../flight/route';
import { CONTENT } from '../../data/content';

const pad = (n: number, w = 3) => String(Math.round(n)).padStart(w, '0');

/**
 * Lectura de DEPURACIÓN (sólo con /?debug en desarrollo) para comprobar la física con números.
 *
 * No usa estado de React: un bucle propio de requestAnimationFrame escribe textContent 10 veces
 * por segundo directamente en el DOM. Es la misma regla que en useFrame (nada de setState por
 * fotograma) aplicada al HTML: React no se entera y no re-renderiza nada.
 */
export function FlightReadout() {
  const ref = useRef<HTMLPreElement>(null);
  const section = useFlight((s) => s.section);
  const camMode = useFlight((s) => s.camMode);

  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 100 || !ref.current) return;
      last = now;
      const f = rig.flight;
      ref.current.textContent =
        `HDG ${pad(norm360(f.heading))}   ALT ${pad(f.alt, 4)} m   ${pad(f.kts)} kt\n` +
        `BANK ${f.bank >= 0 ? 'R' : 'L'}${pad(Math.abs(f.bank), 2)}°   G ${loadFactor(f.bank).toFixed(1)}   ` +
        `γ ${f.gamma >= 0 ? '+' : '−'}${Math.abs(f.gamma).toFixed(1)}°\n` +
        `RUTA ${(f.s / 1000).toFixed(1)} km   SCROLL ${(rig.progress * 100).toFixed(0)}%`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (camMode === 'exterior') return null;
  const s = CONTENT.sections[section]!;
  return (
    <div className="readout">
      <div className="readout-wpt">
        WPT {section}/{N - 1} {s.code} · {s.label}
      </div>
      <pre ref={ref} />
      <div className="readout-keys">W avanzar · S retroceder · M sonido</div>
    </div>
  );
}
