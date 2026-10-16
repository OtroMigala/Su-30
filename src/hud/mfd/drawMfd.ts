// Dibujo del MFD (pantalla multifunción) en un canvas 2D.
//
// Un MFD real es una pantalla rodeada de botones físicos sin rótulo ("OSB", option select
// buttons): la propia pantalla escribe junto a cada botón lo que hace. Aquí, a la izquierda, las
// secciones; a la derecha PRV/NXT (páginas), DCL, D/N, CAUT y A/P.
//
// Cada sección tiene varias páginas (pestañas bajo el título): SISTEMA (física con datos en vivo)
// y STACK (con qué se construyó esa parte del sitio); el briefing añade la ficha del Su-30MKI.
//
// drawMfd devuelve las ZONAS PULSABLES que acaba de dibujar (rectángulos en píxeles del canvas).
// Como salen del mismo código que pinta, el dibujo y los clics nunca se desincronizan.

import { CONTENT } from '../../data/content';
import { G, type FlightState } from '../../flight/route';
import { RADAR, maxRange, snrDb } from '../../avionics/radar';
import type { ContactInfo } from '../../avionics/contacts';
import { GPS_SIGMA } from '../../avionics/navSim';
import { LINK } from '../../avionics/link';

export const MFD_SIZE = 1024;

const GREEN = '#8dffa0';
const DIM = 'rgba(141,255,160,0.5)';
const FAINT = 'rgba(141,255,160,0.14)';
const AMBER = '#ffb84d';
const RED = '#ff5a4f';
const FONT = "'B612 Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;

export type MfdAction =
  | { kind: 'section'; i: number }
  | { kind: 'page'; p: number }
  | { kind: 'prv' }
  | { kind: 'nxt' }
  | { kind: 'dcl' }
  | { kind: 'theme' }
  | { kind: 'caution' }
  | { kind: 'ap' }
  | { kind: 'contact'; i: number }
  | { kind: 'link'; href: string };

export interface MfdRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: MfdAction;
}

/** Datos en vivo para las demostraciones (los calcula Mfd.tsx a ~8 Hz). */
export interface MfdLive {
  f: FlightState;
  /** Tasa de giro medida (°/s). */
  omega: number;
  look: { yaw: number; pitch: number };
  contacts: ContactInfo[];
  nav: { gpsErr: [number, number][]; kfErr: [number, number][]; rmsGps: number; rmsKf: number; vEst: number; vTrue: number };
  comm: { ground: number; slant: number; horizonKm: number; fspl: number; prDbm: number; marginDb: number };
}

export interface MfdModel {
  section: number;
  page: number;
  selContact: number;
  declutter: boolean;
  theme: 'night' | 'dawn';
  /** Quién vuela: el rótulo A/P muestra A/P (ruta), MAN (manual) o RTN (regresando). */
  pilot: 'auto' | 'manual' | 'return';
  /** Aparición del contenido al cambiar de página, 0..1 (se dibuja en 4 escalones). */
  reveal: number;
  /** MASTER CAUTION encendido en este instante (parpadea). */
  caution: boolean;
  hoverId: string | null;
  live: MfdLive | null;
}

/** Pestañas de cada sección. */
export function pagesOf(sectionId: string) {
  if (sectionId === 'start') return ['PILOTO', 'SU-30MKI', 'STACK'];
  if (sectionId === 'credits') return ['STACK', 'CRÉDITOS'];
  return ['SISTEMA', 'STACK'];
}

/** ¿La página muestra datos en vivo? (Mfd.tsx la redibuja periódicamente.) */
export const isLivePage = (sectionId: string, page: number) =>
  page === 0 && ['fcs', 'hud', 'radar', 'nav', 'comm'].includes(sectionId);

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '--');

/** Parte un texto en renglones que caben en `maxW` píxeles (por palabras). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

export function drawMfd(ctx: CanvasRenderingContext2D, m: MfdModel): MfdRegion[] {
  const S = MFD_SIZE;
  const regions: MfdRegion[] = [];
  const hot = (id: string) => m.hoverId === id;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);

  // Fondo: degradado radial verde muy oscuro, más claro arriba del centro (como el prototipo).
  const bg = ctx.createRadialGradient(S / 2, S * 0.4, 0, S / 2, S * 0.4, S * 0.75);
  bg.addColorStop(0, '#04170b');
  bg.addColorStop(1, '#020a05');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  ctx.shadowColor = GREEN;
  ctx.shadowBlur = 8;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;

  // ---------------- Rótulos de los botones (OSB) ----------------
  const osb = (id: string, label: string, y: number, side: -1 | 1, action: MfdAction, on = false) => {
    ctx.font = `bold 26px ${FONT}`;
    const w = ctx.measureText(label).width;
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(side < 0 ? 0 : S, y);
    ctx.lineTo(side < 0 ? 14 : S - 14, y);
    ctx.stroke();
    const tx = side < 0 ? 22 : S - 22 - w;
    if (on || hot(id)) {
      ctx.fillStyle = hot(id) ? 'rgba(141,255,160,0.22)' : FAINT;
      ctx.fillRect(tx - 6, y - 20, w + 12, 40);
    }
    ctx.fillStyle = on ? AMBER : GREEN;
    ctx.textAlign = 'left';
    ctx.fillText(label, tx, y);
    regions.push({ id, x: side < 0 ? 0 : tx - 10, y: y - 30, w: side < 0 ? tx + w + 10 : S - tx + 10, h: 60, action });
  };
  CONTENT.sections.forEach((s, i) => osb(`sec${i}`, s.code, 130 + i * 128, -1, { kind: 'section', i }, i === m.section));
  osb('prv', 'PRV', 150, 1, { kind: 'prv' });
  osb('nxt', 'NXT', 290, 1, { kind: 'nxt' });
  osb('dcl', 'DCL', 430, 1, { kind: 'dcl' }, m.declutter);
  osb('theme', m.theme === 'night' ? 'D/N' : 'N/D', 570, 1, { kind: 'theme' }, m.theme === 'dawn');
  osb('caution', 'CAUT', 710, 1, { kind: 'caution' }, m.caution);
  // Piloto automático: resaltado (ámbar) cuando NO está en ruta, para que se note el modo manual.
  osb('ap', m.pilot === 'auto' ? 'A/P' : m.pilot === 'manual' ? 'MAN' : 'RTN', 850, 1, { kind: 'ap' }, m.pilot !== 'auto');

  // ---------------- Cabecera: título y pestañas ----------------
  const X0 = 150, X1 = 874, W = X1 - X0;
  // Aparición en 4 escalones (como 'steps(4)' en CSS): imita un refresco de pantalla antigua.
  ctx.globalAlpha = Math.ceil(Math.min(1, m.reveal) * 4) / 4;
  const sec = CONTENT.sections[m.section]!;
  const pages = pagesOf(sec.id);
  const page = Math.min(m.page, pages.length - 1);

  ctx.fillStyle = GREEN;
  ctx.textAlign = 'left';
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText(`${pad(m.section)} ${sec.code} // ${sec.label.toUpperCase()}`, X0, 58);
  ctx.font = `bold 21px ${FONT}`;
  let tx = X0;
  pages.forEach((name, p) => {
    const id = `page${p}`, w = ctx.measureText(name).width + 24;
    if (p === page || hot(id)) {
      ctx.fillStyle = p === page ? 'rgba(141,255,160,0.25)' : FAINT;
      ctx.fillRect(tx, 88, w, 34);
    }
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 2;
    ctx.strokeRect(tx, 88, w, 34);
    ctx.fillStyle = p === page ? GREEN : DIM;
    ctx.fillText(name, tx + 12, 106);
    regions.push({ id, x: tx, y: 82, w, h: 46, action: { kind: 'page', p } });
    tx += w + 10;
  });
  ctx.fillStyle = DIM;
  ctx.textAlign = 'right';
  ctx.fillText(`${page + 1}/${pages.length}`, X1, 106);
  ctx.textAlign = 'left';
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(X0, 136);
  ctx.lineTo(X1, 136);
  ctx.stroke();

  // ---------------- Utilidades de texto ----------------
  let y = 172;
  const para = (text: string, size = 24, lh = 32, color = GREEN, indent = 0) => {
    ctx.font = `${size}px ${FONT}`;
    ctx.fillStyle = color;
    for (const l of wrap(ctx, text, W - indent)) {
      ctx.fillText(l, X0 + indent, y);
      y += lh;
    }
  };
  const row = (k: string, v: string, color = GREEN, kw = 240, size = 24, lh = 34) => {
    ctx.font = `${size}px ${FONT}`;
    ctx.fillStyle = DIM;
    ctx.fillText(k, X0, y);
    ctx.fillStyle = color;
    ctx.fillText(v, X0 + kw, y);
    y += lh;
  };
  const link = (id: string, k: string, v: string, href: string) => {
    ctx.font = `24px ${FONT}`;
    ctx.fillStyle = DIM;
    ctx.fillText(k, X0, y);
    ctx.fillStyle = hot(id) ? '#ffffff' : GREEN;
    ctx.fillText(v, X0 + 210, y);
    const w = ctx.measureText(v).width;
    ctx.fillRect(X0 + 210, y + 14, w, hot(id) ? 3 : 1);
    regions.push({ id, x: X0 + 200, y: y - 22, w: w + 20, h: 44, action: { kind: 'link', href } });
    y += 40;
  };

  // ---------------- Páginas ----------------
  const L = m.live;
  if (pages[page] === 'STACK' && sec.id !== 'credits') drawStack();
  else if (sec.id === 'start' && page === 0) drawBriefing();
  else if (sec.id === 'start' && page === 1) drawAircraft();
  else if (sec.id === 'credits' && page === 0) drawFullStack();
  else if (sec.id === 'credits' && page === 1) drawCredits();
  else {
    for (const t of sec.theory) {
      para(t, 23, 31);
      y += 6;
    }
    y += 10;
    if (L) {
      if (sec.id === 'fcs') drawFcs(L);
      else if (sec.id === 'hud') drawHudDemo(L);
      else if (sec.id === 'radar') drawRadar(L);
      else if (sec.id === 'nav') drawNav(L);
      else if (sec.id === 'comm') drawComm(L);
    }
  }

  function drawStack() {
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = AMBER;
    ctx.fillText('CONSTRUIDO CON', X0, y);
    y += 40;
    // Etiquetas en "chips" que saltan de renglón cuando no caben.
    ctx.font = `bold 22px ${FONT}`;
    let cx = X0;
    for (const tag of sec.stack) {
      const w = ctx.measureText(tag).width + 26;
      if (cx + w > X1) {
        cx = X0;
        y += 48;
      }
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, y - 18, w, 36);
      ctx.fillStyle = GREEN;
      ctx.fillText(tag, cx + 13, y);
      cx += w + 12;
    }
    y += 60;
    for (const h of sec.how) {
      ctx.font = `23px ${FONT}`;
      ctx.fillStyle = AMBER;
      ctx.fillText('›', X0, y);
      para(h, 23, 31, GREEN, 28);
      y += 8;
    }
  }

  function drawBriefing() {
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = GREEN;
    ctx.fillText(`${CONTENT.pilot} "${CONTENT.callsign}"`, X0, y);
    y += 42;
    para(CONTENT.role, 22, 30, DIM);
    y += 14;
    for (const t of sec.theory) {
      para(t, 23, 31);
      y += 6;
    }
    y += 12;
    CONTENT.links.forEach(([k, v, href]) => link(`link${k}`, k, v, href));
    y += 14;
    para('W/S volar · Q/E + ENTER destino · F mirar · P vuelo manual · clic en la pantalla', 21, 29, DIM);
  }

  function drawAircraft() {
    for (const [k, v] of CONTENT.aircraft) row(k, v, GREEN, 250, 23, 41);
    y += 6;
    para('Valores aproximados de fuentes públicas.', 20, 28, DIM);
  }

  function drawFullStack() {
    for (const [g, items] of CONTENT.stackGroups) {
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillStyle = AMBER;
      ctx.fillText(g, X0, y);
      y += 32;
      para(items, 22, 30, GREEN, 20);
      y += 14;
    }
  }

  function drawCredits() {
    // Las que tienen enlace se subrayan y se pueden pulsar (se abren en otra pestaña).
    ctx.font = `22px ${FONT}`;
    const lh = 31;
    CONTENT.credits.forEach((c, k) => {
      const id = `cred${k}`;
      const lines = wrap(ctx, c.text, W);
      const top = y - lh / 2;
      lines.forEach((l) => {
        ctx.fillStyle = c.href && hot(id) ? '#ffffff' : GREEN;
        ctx.fillText(l, X0, y);
        if (c.href) ctx.fillRect(X0, y + 13, ctx.measureText(l).width, hot(id) ? 3 : 1);
        y += lh;
      });
      if (c.href) regions.push({ id, x: X0 - 6, y: top, w: W + 12, h: lines.length * lh, action: { kind: 'link', href: c.href } });
      y += 8;
    });
  }

  // ---- FCS: giro coordinado con los valores del vuelo en este instante ----
  function drawFcs(live: MfdLive) {
    const f = live.f, v = f.kts / 1.944, phi = f.roll * DEG, w = live.omega * DEG;
    row('MODO', m.pilot === 'auto' ? 'A/P (ruta)' : m.pilot === 'manual' ? 'MANUAL' : 'A/P (regreso)', m.pilot === 'auto' ? GREEN : AMBER);
    row('VELOCIDAD v', `${fmt(v, 0)} m/s  (${fmt(f.kts, 0)} kt)`);
    row('ALABEO φ', `${fmt(f.roll, 1)}°`);
    row('GIRO ω', `${fmt(live.omega, 2)} °/s`);
    y += 10;
    // Las dos caras de la ecuación: en un giro coordinado son iguales.
    const lhs = Math.tan(phi), rhs = (v * w) / G;
    const ok = Math.abs(lhs - rhs) < 0.06 + 0.05 * Math.abs(lhs);
    row('tan φ', fmt(lhs, 3), GREEN, 240, 26, 38);
    row('v·ω / g', fmt(rhs, 3), GREEN, 240, 26, 38);
    para(ok ? '✓ giro coordinado: ambos lados coinciden' : '≠ fuera de equilibrio (alabeando o tirando)', 22, 30, ok ? GREEN : AMBER);
    y += 14;
    row('n = 1/cos φ', `${fmt(1 / Math.max(Math.cos(phi), 0.05), 2)} g`);
    row('n APLICADO', `${fmt(f.n, 2)} g`);
    // Indicador de G de −3 a +9
    const gx = X0, gw = W, gy = y + 10, n0 = -3, n1 = 9;
    const px = (n: number) => gx + ((n - n0) / (n1 - n0)) * gw;
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 2;
    ctx.strokeRect(gx, gy, gw, 26);
    ctx.fillStyle = f.n > 7 ? RED : GREEN;
    ctx.fillRect(px(Math.min(0, f.n)), gy + 4, Math.abs(px(f.n) - px(0)), 18);
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = DIM;
    for (const n of [-3, 0, 1, 3, 6, 9]) {
      ctx.fillRect(px(n), gy + 26, 2, 8);
      ctx.textAlign = 'center';
      ctx.fillText(String(n), px(n), gy + 48);
    }
    ctx.textAlign = 'left';
  }

  // ---- HUD: colimación y paralaje con la cabeza del piloto en vivo ----
  function drawHudDemo(live: MfdLive) {
    const f = live.f;
    // Desplazamiento lateral de los ojos al girar la cabeza: 9 cm de brazo del cuello + 7 cm de
    // inclinación del tronco (CameraRig.tsx), ∝ sen ψ.
    const d = 0.16 * Math.abs(Math.sin(live.look.yaw * DEG));
    row('CABECEO θ', `${fmt(f.pitch, 1)}° → horizonte a ${fmt(Math.tan(f.pitch * DEG) * 1000, 0)} mm/m`);
    row('CABEZA ψ', `${fmt(live.look.yaw, 1)}°  (F para mirar)`);
    row('OJOS', `desplazados ${fmt(d * 100, 1)} cm`);
    row('PARALAJE 1 m', `${fmt(Math.atan(d / 1) / DEG, 2)}°  (cabina)`, AMBER);
    row('PARALAJE 1 km', `${fmt(Math.atan(d / 1000) / DEG, 4)}°  (HUD)`, GREEN);
    y += 16;
    // Diagrama: ojo, combinador y rayos paralelos (colimados al infinito).
    const ey = y + 110, ex = X0 + 40, cx = X0 + 300;
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ex, ey, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath(); // combinador inclinado
    ctx.moveTo(cx - 40, ey + 90);
    ctx.lineTo(cx + 40, ey - 90);
    ctx.stroke();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = DIM;
    for (const k of [-60, 0, 60]) {
      ctx.beginPath();
      ctx.moveTo(ex + 20, ey + k * 0.25);
      ctx.lineTo(X1, ey + k);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = `20px ${FONT}`;
    ctx.fillStyle = DIM;
    ctx.fillText('ojo', ex - 18, ey + 40);
    ctx.fillText('combinador', cx + 20, ey + 100);
    ctx.fillText('rayos paralelos → ∞', cx + 120, ey - 70);
  }

  // ---- RDR: ecuación del radar con los contactos reales ----
  function drawRadar(live: MfdLive) {
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = DIM;
    ctx.fillText('ID  TIPO              σ m²    R km   SNR dB', X0, y);
    y += 34;
    CONTENT.contacts.forEach((c, i) => {
      const ci = live.contacts[i]!, id = `ct${i}`, sel = i === m.selContact;
      if (sel || hot(id)) {
        ctx.fillStyle = sel ? 'rgba(141,255,160,0.18)' : FAINT;
        ctx.fillRect(X0 - 6, y - 18, W + 12, 36);
      }
      ctx.font = `21px ${FONT}`;
      ctx.fillStyle = ci.detected ? GREEN : DIM;
      const txt = `${c.id}  ${c.kind.padEnd(16).slice(0, 16)}  ${String(c.rcs).padStart(5)}  ${fmt(ci.range / 1000, 1).padStart(6)}  ${fmt(ci.snr, 1).padStart(6)}`;
      ctx.fillText(txt, X0, y);
      ctx.fillStyle = ci.detected ? GREEN : RED;
      ctx.textAlign = 'right';
      ctx.fillText(ci.detected ? 'DET' : '---', X1, y);
      ctx.textAlign = 'left';
      regions.push({ id, x: X0 - 6, y: y - 18, w: W + 12, h: 36, action: { kind: 'contact', i } });
      y += 38;
    });
    const sc = live.contacts[m.selContact]!, c = CONTENT.contacts[m.selContact]!;
    y += 6;
    para(
      `${c.id}: alcance máx. ${fmt(maxRange(c.rcs) / 1000, 1)} km · Doppler ${fmt(sc.doppler / 1000, 2)} kHz (acercamiento ${fmt(sc.closing, 0)} m/s)`,
      21, 29, AMBER,
    );
    y += 10;
    // Gráfica SNR frente a distancia (escala log): cada σ es una recta de pendiente −40 dB/década.
    const gx0 = X0 + 50, gx1 = X1, gy0 = y, gy1 = Math.min(y + 250, 960);
    const rx = (r: number) => gx0 + ((Math.log10(r) - 3) / 2) * (gx1 - gx0); // 1 km … 100 km
    const sy = (s: number) => gy1 - ((s + 10) / 60) * (gy1 - gy0); // −10 … 50 dB
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 2;
    ctx.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.font = `17px ${FONT}`;
    ctx.fillStyle = DIM;
    for (const r of [1e3, 1e4, 1e5]) {
      ctx.textAlign = 'center';
      ctx.fillText(`${r / 1000} km`, rx(r), gy1 + 16);
    }
    ctx.textAlign = 'right';
    for (const s of [0, 20, 40]) ctx.fillText(`${s}`, gx0 - 8, sy(s));
    ctx.textAlign = 'left';
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = RED;
    ctx.beginPath();
    ctx.moveTo(gx0, sy(RADAR.thresholdDb));
    ctx.lineTo(gx1, sy(RADAR.thresholdDb));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.clip();
    CONTENT.contacts.forEach((cc, i) => {
      const sel = i === m.selContact;
      ctx.strokeStyle = sel ? GREEN : DIM;
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(rx(1e3), sy(snrDb(1e3, cc.rcs)));
      ctx.lineTo(rx(1e5), sy(snrDb(1e5, cc.rcs)));
      ctx.stroke();
      const ci = live.contacts[i]!;
      ctx.fillStyle = ci.detected ? GREEN : RED;
      ctx.beginPath();
      ctx.arc(rx(Math.max(ci.range, 1e3)), sy(ci.snr), sel ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    y = gy1 + 30;
  }

  // ---- NAV: errores del GPS frente a los del filtro de Kalman ----
  function drawNav(live: MfdLive) {
    const n = live.nav;
    const size = Math.min(380, 960 - y), cx = X0 + size / 2, cy = y + size / 2, scale = size / 2 / 50; // ±50 m
    ctx.strokeStyle = DIM;
    ctx.lineWidth = 2;
    ctx.strokeRect(X0, y, size, size);
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + size);
    ctx.moveTo(X0, cy);
    ctx.lineTo(X0 + size, cy);
    ctx.stroke();
    for (const r of [GPS_SIGMA, 2 * GPS_SIGMA]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    const dot = (errs: [number, number][], color: string, r: number) => {
      ctx.fillStyle = color;
      errs.forEach(([ex, ez], k) => {
        ctx.globalAlpha = 0.25 + (0.75 * (k + 1)) / errs.length; // los recientes más brillantes
        ctx.beginPath();
        ctx.arc(cx + Math.max(-50, Math.min(50, ex)) * scale, cy - Math.max(-50, Math.min(50, ez)) * scale, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    dot(n.gpsErr, AMBER, 5);
    dot(n.kfErr, GREEN, 6);
    const tx = X0 + size + 30, top = y;
    ctx.font = `20px ${FONT}`;
    const line = (t: string, c = GREEN) => {
      ctx.fillStyle = c;
      ctx.fillText(t, tx, y);
      y += 34;
    };
    y = top + 20;
    line('error frente a la verdad', DIM);
    line('(±50 m, círculos σ y 2σ)', DIM);
    y += 10;
    line(`● GPS  RMS ${fmt(n.rmsGps, 1)} m`, AMBER);
    line(`● KF   RMS ${fmt(n.rmsKf, 1)} m`, GREEN);
    if (n.rmsGps > 0) line(`  error −${fmt(100 * (1 - n.rmsKf / n.rmsGps), 0)} %`, GREEN);
    y += 10;
    line(`v estimada ${fmt(n.vEst, 0)} m/s`);
    line(`v real     ${fmt(n.vTrue, 0)} m/s`, DIM);
    // σ por eje: en 2D el RMS esperado es σ·√2 (dos ejes independientes).
    line(`GPS 1 Hz · σ ${GPS_SIGMA} m/eje`, DIM);
    line(`(RMS 2D esperado ${fmt(GPS_SIGMA * Math.SQRT2, 1)} m)`, DIM);
    y = top + size + 20;
  }

  // ---- COMM: balance de enlace con la torre del despegue ----
  function drawComm(live: MfdLive) {
    const c = live.comm;
    const los = c.ground / 1000 < c.horizonKm;
    row('TORRE', `${fmt(c.ground / 1000, 1)} km · oblicua ${fmt(c.slant / 1000, 1)} km`);
    row('HORIZONTE', `${fmt(c.horizonKm, 0)} km → ${los ? 'línea de vista' : 'FUERA'}`, los ? GREEN : RED);
    row('FRECUENCIA', `${LINK.freq / 1e9} GHz (banda L)`);
    y += 8;
    // Balance en escalones: potencia transmitida, ganancias, pérdidas → recibida.
    const steps: [string, number][] = [
      ['Pt', LINK.ptDbm],
      ['+Gt', LINK.gtDbi],
      ['+Gr', LINK.grDbi],
      ['−pérdidas', -LINK.lossesDb],
      ['−FSPL', -c.fspl],
    ];
    const v0 = -120, v1 = 70, bx0 = X0 + 150, bx1 = X1 - 120;
    const px = (dbm: number) => bx0 + ((dbm - v0) / (v1 - v0)) * (bx1 - bx0);
    let acc = 0;
    ctx.font = `20px ${FONT}`;
    for (const [name, d] of steps) {
      const a = acc;
      acc += d;
      ctx.fillStyle = DIM;
      ctx.fillText(name, X0, y);
      ctx.fillStyle = d >= 0 ? GREEN : AMBER;
      ctx.fillRect(Math.min(px(a), px(acc)), y - 10, Math.max(2, Math.abs(px(acc) - px(a))), 20);
      ctx.fillStyle = GREEN;
      ctx.textAlign = 'right';
      ctx.fillText(`${d >= 0 ? '+' : ''}${fmt(d, 1)}`, X1, y);
      ctx.textAlign = 'left';
      y += 32;
    }
    ctx.strokeStyle = RED;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(LINK.sensitivityDbm), y - 32 * steps.length - 16);
    ctx.lineTo(px(LINK.sensitivityDbm), y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 8;
    const ok = c.marginDb > 0 && los;
    row('RECIBIDA', `${fmt(c.prDbm, 1)} dBm (sensib. ${LINK.sensitivityDbm} dBm)`);
    row('MARGEN', `${fmt(c.marginDb, 1)} dB → ${ok ? 'ENLACE OK' : 'SIN ENLACE'}`, ok ? GREEN : RED);
  }

  ctx.globalAlpha = 1;

  // MASTER CAUTION: marco y aviso ámbar mientras parpadea.
  if (m.caution) {
    ctx.shadowColor = AMBER;
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, S - 16, S - 16);
    ctx.fillStyle = AMBER;
    ctx.font = `bold 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('MASTER CAUTION', S / 2, S - 40);
  }

  // Scanlines: una línea oscura cada 3 px, como el barrido de un tubo de rayos catódicos.
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let sy = 0; sy < S; sy += 3) ctx.fillRect(0, sy, S, 1);

  return regions;
}
