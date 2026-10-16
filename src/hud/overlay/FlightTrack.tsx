import { useEffect, useRef } from 'react';
import { initScroll } from '../../flight/scroll';
import { initKeyboard } from '../../input/keyboard';
import { N } from '../../flight/route';

/**
 * "Pista" de scroll: un bloque alto e invisible detrás del canvas. No muestra nada; sólo le da
 * a la página algo que desplazar. Su altura fija cuánto scroll cuesta cada tramo: la entrada a la
 * cabina más N − 1 tramos de ruta, a SEGMENT_VH de alto de ventana cada uno. Con end = 'bottom
 * bottom', el recorrido útil es altura − 100vh, por eso se suma una pantalla.
 */
const SEGMENT_VH = 120;

export function FlightTrack() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const stopScroll = initScroll(ref.current!);
    const stopKeys = initKeyboard();
    return () => {
      stopKeys();
      stopScroll();
    };
  }, []);
  return <main ref={ref} className="flight-track" style={{ height: `${N * SEGMENT_VH + 100}vh` }} aria-hidden="true" />;
}
