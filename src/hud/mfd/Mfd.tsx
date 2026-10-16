import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { rig, useFlight } from '../../store/flight';
import { CONTENT } from '../../data/content';
import { WP, angDiff } from '../../flight/route';
import { contactInfo } from '../../avionics/contacts';
import { createNavSim, rms, stepNavSim } from '../../avionics/navSim';
import { linkBudget, radioHorizonKm } from '../../avionics/link';
import { goToSection, prefersReducedMotion } from '../../flight/scroll';
import { enterFocus } from '../../input/look';
import { toggleAutopilot } from '../../flight/autopilot';
import { addPickable } from '../../input/picking';
import { radio } from '../overlay/radioQueue';
import { MFD_SIZE, drawMfd, isLivePage, pagesOf, type MfdAction, type MfdLive, type MfdRegion } from './drawMfd';
import { EMISSIVE_GAIN } from '../../scene/Effects';

const REVEAL_TIME = 0.35; // s, aparición del contenido al cambiar de página
const CAUTION_TIME = 3; // s de parpadeo (6 ciclos de 0.5 s, como el prototipo)
/** Periodo de los datos en vivo (s): el simulador de navegación avanza y las páginas en vivo se
 *  redibujan a 8 Hz. Subir un canvas de 1024² a la GPU cada fotograma sería un desperdicio. */
const LIVE_DT = 0.125;
/** Altura de la antena de la torre (m), en el waypoint del despegue. */
const TOWER_H = 10;

/** Busca la zona pulsable bajo un punto del canvas. */
const regionAt = (regions: MfdRegion[], x: number, y: number) =>
  regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null;

/**
 * MFD interactivo sobre la malla `mfd_main`.
 *
 * La textura es un canvas que sólo se redibuja cuando algo cambia (sección, página, botón bajo el
 * cursor, animaciones) o, en las páginas con datos en vivo, a 8 Hz.
 *
 * También hace correr el simulador de navegación (GPS + filtro de Kalman) todo el tiempo, para
 * que la página NAV ya tenga historia cuando se abre.
 *
 * Clics: el raycast del picking devuelve la coordenada UV del punto tocado. Como la textura tiene
 * flipY = false (glTF pone v = 0 en el borde SUPERIOR de la imagen, igual que un canvas), el píxel
 * del canvas es directamente (u·ancho, v·alto).
 */
export function Mfd({ mesh }: { mesh: THREE.Mesh }) {
  const tex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = MFD_SIZE;
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8; // la pantalla se ve oblicua desde el asiento: el filtrado anisótropo evita que se emborrone
    return { canvas, ctx: canvas.getContext('2d')!, texture };
  }, []);

  useEffect(() => {
    const prev = mesh.material;
    // Pantalla emisora: sin iluminación (MeshBasic) y con ganancia HDR, algo menor que la del HUD
    // para que el texto pequeño no se emborrone con el bloom (ver Effects.tsx).
    const material = new THREE.MeshBasicMaterial({ map: tex.texture, color: new THREE.Color().setScalar(EMISSIVE_GAIN * 0.7) });
    mesh.material = material;

    const reduced = prefersReducedMotion();
    let regions: MfdRegion[] = [];
    let hoverId: string | null = null;
    let revealStart = performance.now() - REVEAL_TIME * 1000;
    let cautionStart = -Infinity;
    let raf = 0;
    const nav = createNavSim();
    let live: MfdLive | null = null;
    let lastHeading = rig.flight.heading, omega = 0;
    let lastX = rig.flight.x, lastZ = rig.flight.z, vTrue = 0;

    // Datos en vivo: se calculan aquí (fuera de useFrame, a 8 Hz) leyendo el estado del vuelo.
    const tick = () => {
      const f = rig.flight;
      const s = useFlight.getState();
      if (s.camMode === 'exterior') return;
      // La "verdad" del GPS es la posición que de verdad se mueve: la del suelo (con la deriva del
      // vuelo continuo). La de navegación se queda quieta cuando el avión está en un waypoint.
      stepNavSim(nav, f.x, f.z, LIVE_DT);
      const step = Math.hypot(f.x - lastX, f.z - lastZ);
      vTrue += (step / LIVE_DT - vTrue) * 0.5;
      lastX = f.x;
      lastZ = f.z;
      // Tasa de giro medida: Δψ/Δt (por el camino corto), suavizada.
      omega += (angDiff(f.heading, lastHeading) / LIVE_DT - omega) * 0.5;
      lastHeading = f.heading;
      const tw = WP[0]!, ground = Math.hypot(f.navX - tw.x, f.navZ - tw.z);
      const slant = Math.hypot(ground, f.alt - TOWER_H);
      const b = linkBudget(Math.max(slant, 1));
      live = {
        f,
        omega,
        look: { yaw: rig.look.yaw, pitch: rig.look.pitch },
        contacts: CONTENT.contacts.map((_, i) => contactInfo(i, f)),
        nav: {
          gpsErr: nav.gpsErr, kfErr: nav.kfErr, rmsGps: rms(nav.gpsErr), rmsKf: rms(nav.kfErr),
          vEst: Math.hypot(nav.kx.v, nav.kz.v), vTrue,
        },
        comm: { ground, slant, horizonKm: radioHorizonKm(f.alt, TOWER_H), fspl: b.fspl, prDbm: b.prDbm, marginDb: b.marginDb },
      };
      if (isLivePage(CONTENT.sections[s.section]!.id, s.mfdPage)) schedule();
    };
    const liveTimer = window.setInterval(tick, LIVE_DT * 1000);

    const draw = () => {
      raf = 0;
      const now = performance.now();
      const s = useFlight.getState();
      const reveal = reduced ? 1 : (now - revealStart) / 1000 / REVEAL_TIME;
      const tc = (now - cautionStart) / 1000;
      // Parpadeo: encendido la primera mitad de cada medio segundo.
      const caution = tc < CAUTION_TIME && (reduced || tc % 0.5 < 0.25);
      regions = drawMfd(tex.ctx, {
        section: s.section, page: s.mfdPage, selContact: s.selContact, declutter: s.declutter,
        theme: s.theme, pilot: s.pilot, reveal, caution, hoverId, live,
      });
      tex.texture.needsUpdate = true;
      // Mientras dure una animación, se vuelve a dibujar en el siguiente fotograma.
      if (reveal < 1 || tc < CAUTION_TIME + 0.3) schedule();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const act = (a: MfdAction) => {
      const s = useFlight.getState();
      const nPages = pagesOf(CONTENT.sections[s.section]!.id).length;
      switch (a.kind) {
        case 'section':
          goToSection(a.i);
          break;
        case 'page':
          s.setMfdPage(a.p);
          break;
        case 'prv':
        case 'nxt': {
          // Recorren las páginas de la sección (con vuelta: de la última a la primera).
          const d = a.kind === 'prv' ? -1 : 1;
          s.setMfdPage((s.mfdPage + d + nPages) % nPages);
          break;
        }
        case 'dcl':
          s.setDeclutter(!s.declutter);
          break;
        case 'theme':
          s.setTheme(s.theme === 'night' ? 'dawn' : 'night');
          break;
        case 'caution':
          cautionStart = performance.now();
          radio('SISTEMA', 'Advertencia: nivel de café bajo. Se recomienda aterrizar en la cafetería más cercana.', true);
          schedule();
          break;
        case 'contact':
          s.setSelContact(a.i);
          break;
        case 'ap':
          toggleAutopilot();
          break;
        case 'link':
          window.open(a.href, '_blank', 'noopener,noreferrer');
          break;
      }
    };

    const toCanvas = (hit: THREE.Intersection) => (hit.uv ? { x: hit.uv.x * MFD_SIZE, y: hit.uv.y * MFD_SIZE } : null);
    const unpick = addPickable(mesh, {
      onHover: (hit) => {
        const focused = useFlight.getState().camMode === 'focus';
        const p = hit && focused ? toCanvas(hit) : null;
        const id = p ? (regionAt(regions, p.x, p.y)?.id ?? null) : null;
        if (id !== hoverId) {
          hoverId = id;
          schedule();
        }
        // Fuera de focus, toda la pantalla es "pulsable" (acerca la cámara).
        return hit ? (!focused || id !== null) : false;
      },
      onClick: (hit) => {
        if (useFlight.getState().camMode !== 'focus') return enterFocus();
        const p = toCanvas(hit);
        const r = p && regionAt(regions, p.x, p.y);
        if (r) act(r.action);
      },
    });

    // Redibujar cuando cambia lo que se muestra. Al cambiar de sección, animación de aparición.
    const unsub = useFlight.subscribe((s, prev) => {
      if (s.section !== prev.section || s.mfdPage !== prev.mfdPage) revealStart = performance.now();
      if (
        s.section !== prev.section || s.mfdPage !== prev.mfdPage || s.selContact !== prev.selContact ||
        s.declutter !== prev.declutter || s.theme !== prev.theme || s.pilot !== prev.pilot
      ) schedule();
      if (s.camMode !== prev.camMode && s.camMode !== 'focus' && hoverId) {
        hoverId = null;
        schedule();
      }
    });

    // Flechas ← → = PRV / NXT mientras se mira la pantalla.
    const key = (e: KeyboardEvent) => {
      if (useFlight.getState().camMode !== 'focus' || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'ArrowLeft') act({ kind: 'prv' });
      else if (e.code === 'ArrowRight') act({ kind: 'nxt' });
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', key);

    // La tipografía B612 Mono llega de Google Fonts: si se dibuja antes de que cargue, saldría con
    // la de respaldo. document.fonts.load espera a que esté disponible y entonces se redibuja.
    draw();
    document.fonts?.load(`27px 'B612 Mono'`).then(schedule, () => {});

    return () => {
      clearInterval(liveTimer);
      unsub();
      unpick();
      removeEventListener('keydown', key);
      if (raf) cancelAnimationFrame(raf);
      mesh.material = prev;
      material.dispose();
    };
  }, [mesh, tex]);

  useEffect(() => () => tex.texture.dispose(), [tex]);
  return null;
}
