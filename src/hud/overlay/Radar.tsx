import { useEffect, useRef } from 'react';
import { rig, useFlight } from '../../store/flight';
import { DEG, TARGETS, WP, radarPoint } from '../../flight/route';
import { contactInfo } from '../../avionics/contacts';
import { CONTENT } from '../../data/content';
import { prefersReducedMotion } from '../../flight/scroll';

/** Alcance del radar (m): el borde del círculo. Los waypoints están a 14 km, así que se ve el siguiente. */
const RANGE = 30000;
/** Velocidad angular del barrido (rad/s): una vuelta cada 2.6 s. */
const SWEEP = 2.4;

/**
 * Radar (abajo a la izquierda), con la nariz hacia arriba: el avión propio en el centro y el mundo
 * girando a su alrededor. Se dibuja en un <canvas> 2D con su propio requestAnimationFrame,
 * leyendo el estado del vuelo de `rig` (sin pasar por React).
 *
 * La posición es la de navegación (f.navX/navZ), sin la deriva que usan las luces del suelo: la
 * deriva avanza 170 m/s aunque no vueles y alejaría poco a poco los waypoints de su sitio.
 */
export function Radar() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const reduced = prefersReducedMotion();
    const css = getComputedStyle(document.documentElement);
    const C = {
      hud: css.getPropertyValue('--hud').trim(),
      dim: css.getPropertyValue('--hud-dim').trim(),
      ally: css.getPropertyValue('--ally').trim(),
      alert: css.getPropertyValue('--alert').trim(),
    };
    let dpr = 1, raf = 0;

    // El canvas tiene dos tamaños: el CSS (lo que ocupa en la página) y el de su buffer de píxeles.
    // Con un buffer = tamaño CSS × devicePixelRatio, en pantallas de alta densidad se ve nítido.
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    const t0 = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const w = cv.width, h = cv.height;
      if (!w || !h) return;
      const R = Math.min(w, h) / 2 - 6 * dpr;
      const f = rig.flight;
      const section = useFlight.getState().section;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);

      // Anillos a 10, 20 y 30 km y retícula
      ctx.strokeStyle = C.dim;
      ctx.lineWidth = dpr;
      for (const k of [1 / 3, 2 / 3, 1]) {
        ctx.beginPath();
        ctx.arc(0, 0, R * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-R, 0);
      ctx.lineTo(R, 0);
      ctx.moveTo(0, -R);
      ctx.lineTo(0, R);
      ctx.stroke();

      // Barrido: 14 líneas con opacidad decreciente simulan la persistencia del fósforo de un
      // radar de tubo (la traza se desvanece poco a poco tras pasar el haz).
      if (!reduced) {
        const sw = (((now - t0) / 1000) * SWEEP) % (Math.PI * 2);
        for (let i = 0; i < 14; i++) {
          const a = sw - i * 0.04;
          ctx.strokeStyle = `rgba(141,255,160,${(0.5 * (1 - i / 14)).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.sin(a) * R, -Math.cos(a) * R);
          ctx.stroke();
        }
      }

      const pos = { x: f.navX, z: f.navZ }; // posición de navegación (ruta o vuelo manual)
      ctx.font = `${9 * dpr}px 'B612 Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // Waypoints: triángulos azules (aliados); el activo en verde.
      WP.forEach((p, i) => {
        const q = radarPoint(p.x - pos.x, p.z - pos.z, f.heading, RANGE);
        const x = q.x * R, y = q.y * R;
        ctx.fillStyle = i === section ? C.hud : C.ally;
        ctx.globalAlpha = q.out ? 0.4 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 4 * dpr);
        ctx.lineTo(x - 3.5 * dpr, y + 3 * dpr);
        ctx.lineTo(x + 3.5 * dpr, y + 3 * dpr);
        ctx.closePath();
        ctx.fill();
        if (!q.out) ctx.fillText(CONTENT.sections[i]!.code, x + 5 * dpr, y);
      });

      // Contactos: rombos rojos, sólo si el radar los detecta (SNR sobre el umbral).
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.alert;
      for (const [i, t] of TARGETS.entries()) {
        if (!contactInfo(i, f).detected) continue;
        const q = radarPoint(t.x - pos.x, t.z - pos.z, f.heading, RANGE);
        if (q.out) continue;
        const x = q.x * R, y = q.y * R;
        ctx.beginPath();
        ctx.moveTo(x, y - 3 * dpr);
        ctx.lineTo(x + 3 * dpr, y);
        ctx.lineTo(x, y + 3 * dpr);
        ctx.lineTo(x - 3 * dpr, y);
        ctx.closePath();
        ctx.fill();
      }

      // "N" en el borde: el norte está a −ψ respecto a la nariz.
      const na = -f.heading * DEG;
      ctx.fillStyle = C.hud;
      ctx.textAlign = 'center';
      ctx.fillText('N', Math.sin(na) * (R - 8 * dpr), -Math.cos(na) * (R - 8 * dpr));

      // Avión propio
      ctx.beginPath();
      ctx.moveTo(0, -6 * dpr);
      ctx.lineTo(-4 * dpr, 5 * dpr);
      ctx.lineTo(0, 3 * dpr);
      ctx.lineTo(4 * dpr, 5 * dpr);
      ctx.closePath();
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="radar" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
