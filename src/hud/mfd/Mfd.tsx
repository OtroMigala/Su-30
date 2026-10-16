import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFlight } from '../../store/flight';
import { CONTENT } from '../../data/content';
import { N, PROJ_IDX } from '../../flight/route';
import { goToSection, prefersReducedMotion } from '../../flight/scroll';
import { enterFocus } from '../../input/look';
import { toggleAutopilot } from '../../flight/autopilot';
import { addPickable } from '../../input/picking';
import { radio } from '../overlay/radioQueue';
import { MFD_SIZE, drawMfd, type MfdAction, type MfdRegion } from './drawMfd';
import { EMISSIVE_GAIN } from '../../scene/Effects';

const REVEAL_TIME = 0.35; // s, aparición del contenido al cambiar de página
const CAUTION_TIME = 3; // s de parpadeo (6 ciclos de 0.5 s, como el prototipo)

/** Busca la zona pulsable bajo un punto del canvas. */
const regionAt = (regions: MfdRegion[], x: number, y: number) =>
  regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null;

/**
 * MFD interactivo sobre la malla `mfd_main`.
 *
 * La textura es un canvas que sólo se redibuja cuando algo cambia (sección, proyecto elegido,
 * botón bajo el cursor, animaciones); el resto del tiempo la GPU reutiliza la misma textura.
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

    const draw = () => {
      raf = 0;
      const now = performance.now();
      const s = useFlight.getState();
      const reveal = reduced ? 1 : (now - revealStart) / 1000 / REVEAL_TIME;
      const tc = (now - cautionStart) / 1000;
      // Parpadeo: encendido la primera mitad de cada medio segundo.
      const caution = tc < CAUTION_TIME && (reduced || tc % 0.5 < 0.25);
      regions = drawMfd(tex.ctx, { section: s.section, selProject: s.selProject, declutter: s.declutter, theme: s.theme, pilot: s.pilot, reveal, caution, hoverId });
      tex.texture.needsUpdate = true;
      // Mientras dure una animación, se vuelve a dibujar en el siguiente fotograma.
      if (reveal < 1 || tc < CAUTION_TIME + 0.3) schedule();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const act = (a: MfdAction) => {
      const s = useFlight.getState();
      const nP = CONTENT.projects.length;
      switch (a.kind) {
        case 'section':
          goToSection(a.i);
          break;
        case 'prv':
        case 'nxt': {
          const d = a.kind === 'prv' ? -1 : 1;
          // En proyectos recorren las fichas; en el resto, las secciones.
          if (s.section === PROJ_IDX) s.setSelProject((s.selProject + d + nP) % nP);
          else goToSection(Math.min(N - 1, Math.max(0, s.section + d)));
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
        case 'project':
          s.setSelProject(a.i);
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
      if (s.section !== prev.section) revealStart = performance.now();
      if (s.section !== prev.section || s.selProject !== prev.selProject || s.declutter !== prev.declutter || s.theme !== prev.theme || s.pilot !== prev.pilot) schedule();
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
