import { useFlight } from '../../store/flight';

/** Indicación inicial: en el exterior todavía no hay HUD, así que hay que decir qué hacer. */
export function ScrollHint() {
  const exterior = useFlight((s) => s.camMode === 'exterior');
  return (
    <div className={`scroll-hint${exterior ? '' : ' hidden'}`} aria-hidden={!exterior}>
      HAZ SCROLL PARA ENTRAR A LA CABINA
      <span className="scroll-hint-arrow" aria-hidden="true">▼</span>
    </div>
  );
}
