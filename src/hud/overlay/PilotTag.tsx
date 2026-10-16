import { useFlight } from '../../store/flight';

/**
 * Etiqueta del modo de pilotaje (arriba al centro, bajo la radio): sólo aparece cuando NO vuela el
 * piloto automático por la ruta, y muestra los avisos del vuelo manual.
 */
export function PilotTag() {
  const pilot = useFlight((s) => s.pilot);
  const alert = useFlight((s) => s.alert);
  if (pilot === 'auto') return null;
  const text =
    alert === 'gcas' ? 'AUTO-GCAS · RECUPERACIÓN' : alert === 'area' ? 'FUERA DEL ÁREA DE OPERACIONES' : pilot === 'return' ? 'A/P · REGRESO A RUTA' : 'CONTROL MANUAL';
  return (
    <div className={`pilottag${alert ? ' warn' : ''}`} aria-hidden="true">
      {text}
    </div>
  );
}
