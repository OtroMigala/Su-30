import { useFlight } from '../../store/flight';

/** Indicación inicial: en el exterior todavía no hay HUD, así que hay que decir qué hacer. */
export function ScrollHint() {
  const exterior = useFlight((s) => s.camMode === 'exterior');
  return (
    <div className={`scroll-hint${exterior ? '' : ' hidden'}`} aria-hidden={!exterior}>
      <span>
        MANTÉN <kbd>W</kbd> PARA ENTRAR A LA CABINA
      </span>
      <span className="scroll-hint-sub">o haz scroll · <kbd>S</kbd> retrocede · <kbd>M</kbd> sonido</span>
      <span className="scroll-hint-arrow" aria-hidden="true">▼</span>
    </div>
  );
}
