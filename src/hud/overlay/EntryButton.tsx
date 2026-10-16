import { useFlight } from '../../store/flight';
import { playEntry } from '../../flight/intro';

/**
 * Control PROVISIONAL de la fase 1 para probar la transición exterior ⇄ cabina.
 * En la fase 2 desaparece: el scroll controlará rig.enter.
 */
export function EntryButton() {
  const camMode = useFlight((s) => s.camMode);
  const inside = camMode === 'cockpit';
  return (
    <button className="entry-btn" onClick={() => playEntry(!inside)}>
      {inside ? 'SALIR DE LA CABINA' : 'ENTRAR A LA CABINA'}
    </button>
  );
}
