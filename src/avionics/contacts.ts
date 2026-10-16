// Contactos de radar: distancia, SNR, detección y Doppler de cada uno respecto al avión.
// Lo comparten los recuadros 3D (Targets.tsx), el radar de pantalla y la página RDR del MFD.

import { CONTENT } from '../data/content';
import { DEG, TARGETS, angDiff, type FlightState } from '../flight/route';
import { RADAR, dopplerHz, snrDb } from './radar';

export interface ContactInfo {
  /** Distancia oblicua (m), marcación relativa (°, + derecha) y elevación (°). */
  range: number;
  az: number;
  el: number;
  snr: number;
  detected: boolean;
  /** Velocidad de acercamiento (m/s) y Doppler del eco (Hz). Los contactos están quietos: sólo
   *  se acerca el avión, a v·cos(ángulo entre la nariz y la línea de vista). */
  closing: number;
  doppler: number;
}

export function contactInfo(i: number, f: FlightState): ContactInfo {
  const t = TARGETS[i]!, c = CONTENT.contacts[i]!;
  const dx = t.x - f.navX, dz = t.z - f.navZ, dh = t.alt - f.alt;
  const horiz = Math.hypot(dx, dz);
  const range = Math.hypot(horiz, dh);
  const az = angDiff(Math.atan2(dx, dz) / DEG, f.heading);
  const el = Math.atan2(dh, horiz) / DEG;
  const snr = snrDb(Math.max(range, 1), c.rcs);
  const v = f.kts / 1.944;
  const closing = v * Math.cos(az * DEG) * Math.cos(el * DEG);
  return { range, az, el, snr, detected: snr >= RADAR.thresholdDb, closing, doppler: dopplerHz(closing) };
}
