/** FOV vertical en la cabina (grados), el del prototipo. */
export const FOV_COCKPIT = 62;
/** Campo HORIZONTAL mínimo en la cabina: el HUD del combinador abarca unos ±15°. */
const MIN_HFOV = 36;

/**
 * FOV vertical de la cabina según la proporción de la ventana (ancho / alto).
 *
 * three.js fija el FOV VERTICAL; el horizontal sale de tan(h/2) = aspecto · tan(v/2). En un móvil
 * en vertical (aspecto ≈ 0.46), 62° verticales dejan sólo ~30° horizontales y el HUD se saldría
 * por los lados. Por eso, si hace falta, se abre el vertical lo justo para garantizar MIN_HFOV:
 * v = 2·atan(tan(h/2) / aspecto).
 */
export function cockpitFov(aspect: number) {
  const DEG = Math.PI / 180;
  const needed = (2 * Math.atan(Math.tan((MIN_HFOV / 2) * DEG) / aspect)) / DEG;
  return Math.max(FOV_COCKPIT, needed);
}
