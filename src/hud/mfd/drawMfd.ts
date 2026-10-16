// Dibujo del MFD (pantalla multifunción) en un canvas 2D, portado de renderScreen del prototipo.
//
// Un MFD real es una pantalla rodeada de botones físicos sin rótulo ("OSB", option select
// buttons): la propia pantalla escribe junto a cada botón lo que hace. Aquí se dibujan esos
// rótulos en los bordes (izquierda: secciones; derecha: PRV, NXT, DCL, D/N, CAUT) y el contenido
// de la sección en el centro.
//
// drawMfd devuelve las ZONAS PULSABLES que acaba de dibujar (rectángulos en píxeles del canvas).
// Como salen del mismo código que pinta, el dibujo y los clics nunca se desincronizan.

import { CONTENT } from '../../data/content';
import { L_TOTAL, N } from '../../flight/route';

export const MFD_SIZE = 1024;

const GREEN = '#8dffa0';
const DIM = 'rgba(141,255,160,0.5)';
const FAINT = 'rgba(141,255,160,0.14)';
const AMBER = '#ffb84d';
const FONT = "'B612 Mono', ui-monospace, monospace";

export type MfdAction =
  | { kind: 'section'; i: number }
  | { kind: 'prv' }
  | { kind: 'nxt' }
  | { kind: 'dcl' }
  | { kind: 'theme' }
  | { kind: 'caution' }
  | { kind: 'ap' }
  | { kind: 'project'; i: number }
  | { kind: 'link'; href: string };

export interface MfdRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: MfdAction;
}

export interface MfdModel {
  section: number;
  selProject: number;
  declutter: boolean;
  theme: 'night' | 'dawn';
  /** Aparición del contenido al cambiar de página, 0..1 (se dibuja en 4 escalones). */
  reveal: number;
  /** MASTER CAUTION encendido en este instante (parpadea). */
  caution: boolean;
  /** Quién vuela: el rótulo A/P muestra A/P (ruta), MAN (manual) o RTN (regresando). */
  pilot: 'auto' | 'manual' | 'return';
  hoverId: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

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

  // Fondo: degradado radial verde muy oscuro, más claro arriba del centro (como el prototipo).
  const g = ctx.createRadialGradient(S / 2, S * 0.4, 0, S / 2, S * 0.4, S * 0.75);
  g.addColorStop(0, '#04170b');
  g.addColorStop(1, '#020a05');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  ctx.shadowColor = GREEN;
  ctx.shadowBlur = 8;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;

  // ---------------- Rótulos de los botones (OSB) ----------------
  const osb = (id: string, label: string, y: number, side: -1 | 1, action: MfdAction, on = false) => {
    ctx.font = `bold 26px ${FONT}`;
    const w = ctx.measureText(label).width;
    // Marca que "apunta" al botón físico del borde
    ctx.strokeStyle = DIM;
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
    regions.push({ id, x: side < 0 ? 0 : tx - 10, y: y - 34, w: side < 0 ? tx + w + 10 : S - tx + 10, h: 68, action });
  };
  CONTENT.sections.forEach((s, i) =>
    osb(`sec${i}`, s.code, 150 + i * 140, -1, { kind: 'section', i }, i === m.section),
  );
  osb('prv', 'PRV', 150, 1, { kind: 'prv' });
  osb('nxt', 'NXT', 290, 1, { kind: 'nxt' });
  osb('dcl', 'DCL', 430, 1, { kind: 'dcl' }, m.declutter);
  osb('theme', m.theme === 'night' ? 'D/N' : 'N/D', 570, 1, { kind: 'theme' }, m.theme === 'dawn');
  osb('caution', 'CAUT', 710, 1, { kind: 'caution' }, m.caution);
  // Piloto automático: resaltado (ámbar) cuando NO está en ruta, para que se note el modo manual.
  osb('ap', m.pilot === 'auto' ? 'A/P' : m.pilot === 'manual' ? 'MAN' : 'RTN', 850, 1, { kind: 'ap' }, m.pilot !== 'auto');

  // ---------------- Contenido ----------------
  const X0 = 150, X1 = 874, W = X1 - X0;
  // Aparición en 4 escalones (como 'steps(4)' en CSS): imita un refresco de pantalla antigua.
  ctx.globalAlpha = Math.ceil(Math.min(1, m.reveal) * 4) / 4;
  const s = CONTENT.sections[m.section]!;

  ctx.fillStyle = GREEN;
  ctx.textAlign = 'left';
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText(`${pad(m.section)} ${s.code} // ${s.label.toUpperCase()}`, X0, 70);
  ctx.strokeStyle = DIM;
  ctx.beginPath();
  ctx.moveTo(X0, 100);
  ctx.lineTo(X1, 100);
  ctx.stroke();

  ctx.font = `27px ${FONT}`;
  const LH = 40;
  let y = 145;
  const line = (text: string, color = GREEN) => {
    ctx.fillStyle = color;
    ctx.fillText(text, X0, y);
    y += LH;
  };
  const row = (k: string, v: string) => {
    ctx.fillStyle = DIM;
    ctx.fillText(k, X0, y);
    ctx.fillStyle = GREEN;
    ctx.fillText(v, X0 + 230, y);
    y += LH;
  };

  switch (s.id) {
    case 'start':
      row('PILOTO', CONTENT.pilot);
      row('CALLSIGN', CONTENT.callsign);
      row('RUTA', `${N} WAYPOINTS · ${(L_TOTAL / 1000).toFixed(0)} KM`);
      row('ESTADO', 'LISTO');
      y += LH / 2;
      for (const l of wrap(ctx, 'Mantén W para despegar. Q/E y ENTER eligen destino; F mira alrededor.', W)) line(l);
      break;

    case 'about':
      for (const l of CONTENT.about) {
        if (!l) y += LH / 2;
        else for (const w of wrap(ctx, l, W)) line(w);
      }
      break;

    case 'projects': {
      CONTENT.projects.forEach((p, k) => {
        const id = `proj${k}`, sel = k === m.selProject;
        if (hot(id)) {
          ctx.fillStyle = FAINT;
          ctx.fillRect(X0 - 8, y - 20, W + 16, 40);
        }
        line(`${sel ? '>' : ' '} ${p.id} ${p.name.toUpperCase()}`, sel || hot(id) ? GREEN : DIM);
        regions.push({ id, x: X0 - 8, y: y - LH - 20, w: W + 16, h: LH, action: { kind: 'project', i: k } });
      });
      y += 10;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(X0, y - 10);
      ctx.lineTo(X1, y - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      y += 20;
      const p = CONTENT.projects[m.selProject]!;
      line(`TAG  ${p.tag}`, AMBER);
      for (const l of wrap(ctx, p.desc, W)) line(l);
      y += LH / 2;
      ctx.font = `22px ${FONT}`;
      line('PRV/NXT o clic en un objetivo del cielo', DIM);
      break;
    }

    case 'skills':
      for (const [name, level] of CONTENT.skills) {
        ctx.fillStyle = GREEN;
        ctx.fillText(name, X0, y);
        // Barra de 10 segmentos: llenos hasta el nivel, sólo el contorno después.
        for (let i = 0; i < 10; i++) {
          const bx = X0 + 300 + i * 40;
          if (i < level) {
            ctx.fillStyle = GREEN;
            ctx.fillRect(bx, y - 12, 32, 24);
          } else {
            ctx.strokeStyle = DIM;
            ctx.lineWidth = 2;
            ctx.strokeRect(bx + 1, y - 11, 30, 22);
          }
        }
        y += LH + 8;
      }
      break;

    case 'contact':
      for (const [k, v, href] of CONTENT.contact) {
        const id = `link${k}`;
        ctx.fillStyle = DIM;
        ctx.fillText(k, X0, y);
        ctx.fillStyle = GREEN;
        ctx.fillText(v, X0 + 200, y);
        const w = ctx.measureText(v).width;
        // Subrayado como en un enlace; más grueso con el cursor encima.
        ctx.fillRect(X0 + 200, y + 16, w, hot(id) ? 4 : 2);
        regions.push({ id, x: X0 + 190, y: y - 26, w: w + 20, h: 52, action: { kind: 'link', href } });
        y += LH + 20;
      }
      y += LH / 2;
      ctx.font = `22px ${FONT}`;
      line('Clic en un enlace para abrirlo', DIM);
      break;

    case 'credits': {
      // Letra algo menor: son 8 entradas que deben caber sin desplazarse. Las que tienen enlace se
      // subrayan y se pueden pulsar (se abren en otra pestaña).
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
      break;
    }
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
    ctx.fillText('MASTER CAUTION', S / 2, S - 50);
  }

  // Scanlines: una línea oscura cada 3 px, como el barrido de un tubo de rayos catódicos.
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let sy = 0; sy < S; sy += 3) ctx.fillRect(0, sy, S, 1);

  return regions;
}
