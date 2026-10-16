// Dibujo de la simbología del HUD en un canvas 2D (portado de drawHUD en reference/cockpit-hud.html).
//
// Dos clases de símbolos:
//  · CONFORMES (escalera, horizonte, marcador de trayectoria, NEXT): marcan direcciones reales del
//    mundo. Se colocan proyectando su dirección (projection.ts), así coinciden con lo que se ve
//    a través del vidrio.
//  · NO CONFORMES (cintas de velocidad, altitud y rumbo, textos): son "instrumentos" pintados en
//    posiciones fijas del vidrio.
//
// Un combinador sólo SUMA luz a lo que hay detrás (refleja la imagen de un proyector sobre un
// vidrio semitransparente): no puede oscurecer. Por eso no hay negro ni cajas de fondo, a
// diferencia del prototipo, y el plano se dibuja con mezcla aditiva.

import * as THREE from 'three';
import { ALT, DEG, L_TOTAL, N, SEG, WP, angDiff, clamp, loadFactor, norm360, posAt } from '../../flight/route';
import type { FlightState } from '../../flight/route';
import { CONTENT } from '../../data/content';
import { projectWorld, type HudRect } from './projection';

export const HUD_COLOR = '#8dffa0';
const ALLY = '#7fd4ff';

export interface HudCanvas {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Rectángulo del plano del HUD (unidades de tangente) que ocupa el canvas entero. */
  rect: HudRect;
  /** Píxeles del canvas por píxel CSS de pantalla: escala grosores y tipografía. */
  k: number;
}

/**
 * Posición de los instrumentos NO conformes, en grados desde el eje de la nariz (az + = derecha,
 * el + = arriba). Salen de medir con rayos qué tapa la cabina vista desde cam_pilot:
 *  · entre los dos soportes del HUD (|az| < 6.5°) el vidrio se ve de +2° (arco del parabrisas)
 *    a −9° (antepecho);
 *  · por fuera de los soportes (|az| de 8° a 16°) se ve de −1° a −14°.
 * Por eso la cinta de rumbo va abajo en el centro (como en el F-16) y las cintas de velocidad y
 * altitud, en los laterales. Si cambias COMBINER_SCALE mucho o reexportas la cabina, revísalo.
 */
const LAYOUT = {
  headEl: -7.4, // cinta de rumbo
  headHalfAz: 6, // medio ancho de la cinta de rumbo
  tapeAz: 9, // línea de las cintas laterales (los soportes están en ±6.5–7.5°)
  tapeEl: -4.8, // centro vertical de las cintas
  tapeHalfEl: 3.4, // medio alto de las cintas
  // Datos (Mach y G a la izquierda, waypoint a la derecha), en dos renglones. El vidrio es un
  // trapecio que se estrecha hacia abajo: más abajo de ~−11° las esquinas los cortarían.
  infoEl: -9.6,
  infoAz: 8.3, // borde interior de esos bloques, junto a los soportes
  /** Techo del dibujo: el borde inferior del arco del parabrisas. El vidrio agrandado asoma por
   *  encima del arco (a través del cristal del canopy) y ahí no debe verse simbología. */
  topEl: 2,
};

const pad = (n: number, w = 2) => String(Math.round(n)).padStart(w, '0');
const CARDINAL: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

/** @param declutter DCL del MFD: oculta la escalera de cabeceo (como el prototipo). */
export function drawHud(hc: HudCanvas, f: FlightState, attitude: THREE.Quaternion, declutter = false) {
  const { ctx, w, h, rect, k } = hc;
  // Plano del HUD (tangentes) → píxeles del canvas. La y del canvas crece hacia abajo.
  const sx = w / (rect.x1 - rect.x0);
  const sy = h / (rect.y1 - rect.y0);
  const X = (x: number) => (x - rect.x0) * sx;
  const Y = (y: number) => (rect.y1 - y) * sy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = ctx.fillStyle = HUD_COLOR;
  ctx.shadowColor = HUD_COLOR;
  ctx.shadowBlur = 4 * k; // resplandor del fósforo (la fase 7 añade bloom de verdad)
  ctx.lineWidth = 1.5 * k;
  ctx.lineJoin = ctx.lineCap = 'round';
  const fs = Math.round(12 * k);
  ctx.font = `${fs}px 'B612 Mono', monospace`;
  ctx.textBaseline = 'middle';

  // Instrumentos fijos al vidrio: un ángulo (respecto a la nariz) → píxel del canvas. Es la misma
  // proyección gnomónica (tan) con la dirección ya expresada en el cuerpo del avión.
  const T = (deg: number) => Math.tan(deg * DEG);
  const AX = (az: number) => X(T(az));
  const EY = (el: number) => Y(T(el));
  const headY = EY(LAYOUT.headEl);
  const infoY = EY(LAYOUT.infoEl);
  const tapeCy = EY(LAYOUT.tapeEl);
  const tapeH = EY(LAYOUT.tapeEl - LAYOUT.tapeHalfEl) - EY(LAYOUT.tapeEl + LAYOUT.tapeHalfEl);

  // Todo lo que sigue se recorta por debajo del arco del parabrisas.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, EY(LAYOUT.topEl), w, h);
  ctx.clip();

  // ---------------- Escalera de cabeceo (conforme) ----------------
  // Cada peldaño a elevación a: su centro es la dirección (az 0, el a) y su orientación la da otro
  // punto del mismo peldaño 2° a la derecha. Ambos proyectados: así el peldaño queda exactamente
  // donde está esa elevación en el cielo, gire o cabecee el avión como sea.
  ctx.save();
  // Medidas de los peldaños fijadas en grados (no en fracciones del canvas): así no cambian si
  // cambia la escala del combinador.
  const half = AX(3.2) - AX(0), gap = AX(1.4) - AX(0);
  for (let a = -60; a <= 60 && !declutter; a += 5) {
    const c = projectWorld(0, a, attitude);
    if (!c.front) continue;
    const cx = X(c.x), cy = Y(c.y);
    if (cy < -h || cy > 2 * h) continue;
    const e = projectWorld(2, a, attitude);
    const ang = Math.atan2(Y(e.y) - cy, X(e.x) - cx); // inclinación del peldaño en pantalla
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    if (a === 0) {
      // Línea de horizonte: larga y con un hueco en el centro
      ctx.beginPath();
      const far = AX(16) - AX(0), near = AX(2.2) - AX(0);
      ctx.moveTo(-far, 0); ctx.lineTo(-near, 0);
      ctx.moveTo(near, 0); ctx.lineTo(far, 0);
      ctx.stroke();
    } else {
      // Peldaños: continuos arriba del horizonte, discontinuos abajo (convención real de los HUD),
      // con las puntas señalando hacia el horizonte.
      const tick = (a > 0 ? 6 : -6) * k;
      ctx.setLineDash(a < 0 ? [7 * k, 5 * k] : []);
      ctx.beginPath();
      ctx.moveTo(-gap, tick); ctx.lineTo(-gap, 0); ctx.lineTo(-gap - half, 0);
      ctx.moveTo(gap, tick); ctx.lineTo(gap, 0); ctx.lineTo(gap + half, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.abs(a)), -gap - half - 6 * k, 0);
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.abs(a)), gap + half + 6 * k, 0);
    }
    ctx.restore();
  }
  ctx.restore();

  // ---------------- Marcador de trayectoria (conforme) ----------------
  // Hacia dónde va REALMENTE el avión: el vector velocidad, a elevación γ en el rumbo (giro
  // coordinado = sin derrape, así que va justo por delante). La nariz va AOA grados más arriba.
  const fpm = projectWorld(0, f.gamma, attitude);
  const fx = X(fpm.x), fy = Y(fpm.y), r = 7 * k;
  ctx.beginPath();
  ctx.arc(fx, fy, r, 0, Math.PI * 2);
  ctx.moveTo(fx - r, fy); ctx.lineTo(fx - 20 * k, fy);
  ctx.moveTo(fx + r, fy); ctx.lineTo(fx + 20 * k, fy);
  ctx.moveTo(fx, fy - r); ctx.lineTo(fx, fy - 14 * k);
  ctx.stroke();

  // Referencia de la nariz ("W" o waterline): el eje del avión, centro de la proyección (0, 0).
  const nx = X(0), ny = Y(0);
  ctx.beginPath();
  ctx.moveTo(nx - 12 * k, ny); ctx.lineTo(nx - 5 * k, ny); ctx.lineTo(nx, ny + 5 * k);
  ctx.lineTo(nx + 5 * k, ny); ctx.lineTo(nx + 12 * k, ny);
  ctx.stroke();

  // ---------------- Cinta de rumbo (no conforme) ----------------
  // Va abajo: las marcas cuelgan hacia arriba desde la línea base y los números van debajo.
  // No es conforme: comprime ±30° de rumbo en el ancho de la cinta.
  const span = 20, cx0 = AX(0), sc = (AX(LAYOUT.headHalfAz) - cx0) / span;
  ctx.textAlign = 'center';
  for (let d = Math.ceil((f.heading - span) / 5) * 5; d <= f.heading + span; d += 5) {
    const x = cx0 + angDiff(d, f.heading) * sc, major = norm360(d) % 10 === 0;
    ctx.beginPath();
    ctx.moveTo(x, headY);
    ctx.lineTo(x, headY - (major ? 8 : 4) * k);
    ctx.stroke();
    if (major) {
      const v = norm360(d);
      ctx.fillText(CARDINAL[v] ?? pad(v, 3), x, headY + 10 * k);
    }
  }
  // Índice del rumbo actual: triángulo encima de la cinta
  ctx.beginPath();
  ctx.moveTo(cx0, headY - 11 * k);
  ctx.lineTo(cx0 - 5 * k, headY - 18 * k);
  ctx.lineTo(cx0 + 5 * k, headY - 18 * k);
  ctx.closePath();
  ctx.stroke();

  // Siguiente waypoint: marca azul sobre la cinta y recuadro NEXT en el cielo (conforme).
  const nextIdx = clamp(Math.floor(f.s / SEG + 0.08) + 1, 1, N - 1);
  const pos = posAt(f.s), wp = WP[nextIdx]!;
  const bear = Math.atan2(wp.x - pos.x, wp.z - pos.z) / DEG; // marcación: atan2(este, norte)
  const dist = Math.hypot(wp.x - pos.x, wp.z - pos.z);
  const azR = angDiff(bear, f.heading);
  ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = ALLY;
  const bx = cx0 + clamp(azR, -span, span) * sc;
  ctx.beginPath();
  ctx.moveTo(bx, headY - 2 * k);
  ctx.lineTo(bx - 5 * k, headY - 10 * k);
  ctx.lineTo(bx + 5 * k, headY - 10 * k);
  ctx.closePath();
  ctx.fill();
  if (f.s < L_TOTAL - 50 && Math.abs(azR) < 70) {
    // Elevación del waypoint: −atan(Δh / d), como las luces del suelo pero hacia su altitud.
    const elR = -Math.atan((f.alt - ALT[nextIdx]!) / Math.max(dist, 1)) / DEG;
    const p = projectWorld(azR, elR, attitude);
    if (p.front) {
      const px = X(p.x), py = Y(p.y), b = 10 * k;
      ctx.strokeRect(px - b, py - b, 2 * b, 2 * b);
      ctx.textAlign = 'left';
      ctx.fillText(`NEXT ${CONTENT.sections[nextIdx]!.code}`, px + 15 * k, py - 6 * k);
      ctx.fillText(`${(dist / 1000).toFixed(1)} KM`, px + 15 * k, py + 9 * k);
    }
  }
  ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = HUD_COLOR;

  // ---------------- Cintas de velocidad y altitud (no conformes) ----------------
  const bw = 50 * k, bh = 22 * k;
  const tapes = [
    { x: AX(-LAYOUT.tapeAz), val: f.kts, step: 10, pxPer: 2.4 * k, label: 'SPEED', side: -1, round: 1 },
    { x: AX(LAYOUT.tapeAz), val: f.alt * 3.281, step: 100, pxPer: 0.26 * k, label: 'ALT', side: 1, round: 10 }, // m → ft
  ];
  for (const t of tapes) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(t.x - 40 * k, tapeCy - tapeH / 2, 80 * k, tapeH);
    ctx.clip();
    const halfRange = tapeH / t.pxPer / 2;
    for (let v = Math.floor((t.val - halfRange) / t.step) * t.step; v <= t.val + halfRange; v += t.step) {
      const y = tapeCy + (t.val - v) * t.pxPer, major = Math.round(v / t.step) % 5 === 0;
      ctx.beginPath();
      ctx.moveTo(t.x, y);
      ctx.lineTo(t.x + t.side * (major ? 10 : 5) * k, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(t.x, tapeCy - tapeH / 2);
    ctx.lineTo(t.x, tapeCy + tapeH / 2);
    ctx.stroke();
    const boxX = t.side < 0 ? t.x - bw - 6 * k : t.x + 6 * k;
    ctx.strokeRect(boxX, tapeCy - bh / 2, bw, bh);
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(t.val / t.round) * t.round), boxX + bw / 2, tapeCy);
    ctx.fillText(t.label, boxX + bw / 2, tapeCy - bh / 2 - 10 * k);
  }

  // ---------------- Datos inferiores ----------------
  // Velocidad del sonido a = √(γ·R·T): baja con la temperatura, que en la troposfera cae
  // ~6.5 K por km. Linealizado: a ≈ 340 − 0.004·h m/s. Mach = v / a (nudos → m/s: × 0.5144).
  const a0 = 340 - 0.004 * f.alt;
  const mach = (f.kts * 0.5144) / a0;
  // Dos bloques pegados por fuera de los soportes (en el centro los taparía la consola), cada uno
  // en dos renglones para no salirse del borde del vidrio.
  const lh = 15 * k;
  ctx.textAlign = 'right';
  ctx.fillText(`M ${mach.toFixed(2)}`, AX(-LAYOUT.infoAz), infoY);
  ctx.fillText(`G ${loadFactor(f.bank).toFixed(1)}`, AX(-LAYOUT.infoAz), infoY + lh);
  ctx.textAlign = 'left';
  ctx.fillText(CONTENT.sections[nextIdx]!.code, AX(LAYOUT.infoAz), infoY);
  ctx.fillText(`${(dist / 1000).toFixed(1)}KM`, AX(LAYOUT.infoAz), infoY + lh);
  ctx.restore(); // fin del recorte bajo el arco
}
