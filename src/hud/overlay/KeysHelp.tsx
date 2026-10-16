/** Ayuda de teclas (arriba a la derecha; se oculta en pantallas estrechas, sin teclado). */
export function KeysHelp() {
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
    </div>
  );
}
