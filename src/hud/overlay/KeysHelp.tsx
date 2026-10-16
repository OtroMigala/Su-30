import { useFlight } from '../../store/flight';

/** Ayuda de teclas (arriba a la derecha; se oculta en pantallas estrechas, sin teclado). */
export function KeysHelp() {
  const pilot = useFlight((s) => s.pilot);
  if (pilot !== 'auto')
    return (
      <div className="keys" aria-hidden="true">
        <div>
          <kbd>W</kbd> <kbd>S</kbd> cabeceo · <kbd>A</kbd> <kbd>D</kbd> alabeo
        </div>
        <div>
          <kbd>SPACE</kbd> acelerar · <kbd>SHIFT</kbd> frenar
        </div>
        <div>
          <kbd>P</kbd> piloto automático · <kbd>F</kbd> mirar · <kbd>M</kbd> sonido
        </div>
      </div>
    );
  return (
    <div className="keys" aria-hidden="true">
      <div>
        <kbd>W</kbd> <kbd>S</kbd> volar
      </div>
      <div>
        <kbd>Q</kbd> <kbd>E</kbd> elegir sección · <kbd>ENTER</kbd> ir
      </div>
      <div>
        <kbd>1</kbd>–<kbd>6</kbd> salto directo · <kbd>M</kbd> sonido
      </div>
      <div>
        <kbd>F</kbd> mirar alrededor · <kbd>ESC</kbd> soltar · clic en la pantalla
      </div>
      <div>
        <kbd>P</kbd> vuelo manual
      </div>
    </div>
  );
}
