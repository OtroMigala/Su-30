import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rig, useFlight } from '../store/flight';
import { CONTENT } from '../data/content';
import { DEG, PROJ_IDX, SEG, TARGETS, angDiff, posAt } from '../flight/route';
import { goToSection } from '../flight/scroll';
import { worldDir } from '../hud/combiner/projection';
import { addPickable } from '../input/picking';
import { radio } from '../hud/overlay/radioQueue';

/** Radio de la esfera sobre la que se dibujan (m): lejos de la cabina, dentro del plano lejano. */
const R = 900;
/** Tamaño angular del recuadro (grados): ~34 px en 720p, como en el prototipo. */
const BOX_DEG = 2.6;
const BOX_DEG_LOCKED = 2.0;

// Canvas del rótulo: el recuadro a la izquierda y el texto a su derecha. El sprite se ancla en el
// centro del recuadro (sprite.center), para que el recuadro quede exactamente sobre el objetivo.
const CW = 320, CH = 96, BOX = 64, BOX_CX = 4 + BOX / 2;

function makeLabel(i: number) {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(BOX_CX / CW, 0.5);
  sprite.visible = false;
  sprite.renderOrder = 5;
  sprite.name = `target_${CONTENT.projects[i]!.id}`;
  return { canvas, ctx: canvas.getContext('2d')!, texture, material, sprite, text: '' };
}

function drawLabel(l: ReturnType<typeof makeLabel>, i: number, km: string, locked: boolean) {
  const key = `${km}|${locked}`;
  if (key === l.text) return; // sólo se redibuja (y se sube a la GPU) si cambió algo
  l.text = key;
  const p = CONTENT.projects[i]!, c = l.ctx;
  const color = locked ? '#ff5a4f' : '#8dffa0';
  c.clearRect(0, 0, CW, CH);
  c.strokeStyle = c.fillStyle = c.shadowColor = color;
  c.shadowBlur = 8;
  c.lineWidth = 4;
  // Recuadro de designación: más pequeño cuando está fijado (el prototipo lo encoge 34 → 26 px).
  const b = locked ? BOX * (BOX_DEG_LOCKED / BOX_DEG) : BOX;
  c.strokeRect(BOX_CX - b / 2, CH / 2 - b / 2, b, b);
  c.font = "26px 'B612 Mono', monospace";
  c.textBaseline = 'middle';
  c.fillText(`${p.id} ${p.tag}`, BOX + 18, CH / 2 - 16);
  c.globalAlpha = 0.6;
  c.fillText(km, BOX + 18, CH / 2 + 16);
  c.globalAlpha = 1;
  l.texture.needsUpdate = true;
}

/**
 * Proyectos como objetivos en el cielo, cerca del waypoint de proyectos (posiciones en route.ts).
 *
 * Están a 3.6–9 km: a esa distancia un objeto real ocuparía una fracción de grado, así que lo que
 * se ve es el RECUADRO DE DESIGNACIÓN (como en Ace Combat), un sprite que siempre mira a la cámara.
 * Igual que las luces del suelo, se coloca en su dirección real (marcación relativa y elevación
 * atan(Δh/d)) sobre una esfera de R metros, y se escala para que mida siempre BOX_DEG grados:
 * un objeto de lado L a distancia R subtiende 2·atan(L/2R), así que L = 2R·tan(ángulo/2).
 *
 * Cursor encima → se fija (rojo); clic → su ficha en el MFD.
 */
export function Targets() {
  const camera = useThree((s) => s.camera);
  const labels = useMemo(() => CONTENT.projects.map((_, i) => makeLabel(i)), []);
  const tmp = useMemo(() => ({ cam: new THREE.Vector3(), dir: new THREE.Vector3() }), []);

  useEffect(() => {
    const offs = labels.map((l, i) =>
      addPickable(l.sprite, {
        onHover: (hit) => {
          const s = useFlight.getState();
          if (hit && s.lockId !== i) {
            s.setLockId(i);
            radio('AWACS', `Objetivo fijado: ${CONTENT.projects[i]!.name}. Haz clic para ver el informe.`, true);
          } else if (!hit && s.lockId === i) s.setLockId(-1);
          return true;
        },
        onClick: () => {
          const s = useFlight.getState();
          s.setSelProject(i);
          radio('AWACS', `Informe de ${CONTENT.projects[i]!.name} en tu pantalla.`, true);
          if (s.section !== PROJ_IDX) goToSection(PROJ_IDX);
        },
      }),
    );
    return () => {
      offs.forEach((off) => off());
      labels.forEach((l) => {
        l.texture.dispose();
        l.material.dispose();
      });
    };
  }, [labels]);

  useFrame(() => {
    const f = rig.flight;
    const s = useFlight.getState();
    const inside = s.camMode === 'cockpit' || s.camMode === 'free';
    // Sólo cerca del waypoint de proyectos (±0.85 tramos), como en el prototipo.
    const near = Math.abs(f.s - PROJ_IDX * SEG) < SEG * 0.85;
    const pos = posAt(f.s); // posición de la ruta, sin deriva (como el radar y el NEXT)
    camera.getWorldPosition(tmp.cam);

    TARGETS.forEach((t, i) => {
      const l = labels[i]!;
      const dx = t.x - pos.x, dz = t.z - pos.z, d = Math.hypot(dx, dz);
      const az = angDiff(Math.atan2(dx, dz) / DEG, f.heading);
      const visible = inside && near && Math.abs(az) < 75 && d > 300;
      l.sprite.visible = visible;
      // (Si se oculta estando fijado, el picking lo suelta en el siguiente movimiento del ratón:
      // aquí no se toca el store, que sería un setState por fotograma.)
      if (!visible) return;
      const el = Math.atan((t.alt - f.alt) / d) / DEG;
      // worldDir: marco del mundo ya girado por el rumbo (delante +Z, derecha −X).
      l.sprite.position.copy(tmp.cam).addScaledVector(worldDir(az, el, tmp.dir), R);
      // Escala constante: BOX píxeles del canvas = BOX_DEG grados. El alto del sprite es entonces
      // 2R·tan(BOX_DEG/2) · (CH/BOX). Al fijarlo sólo se dibuja un recuadro más pequeño.
      const h = 2 * R * Math.tan((BOX_DEG * DEG) / 2) * (CH / BOX);
      l.sprite.scale.set(h * (CW / CH), h, 1);
      drawLabel(l, i, `${(d / 1000).toFixed(1)} KM`, s.lockId === i);
    });
  });

  return (
    <>
      {labels.map((l) => (
        <primitive key={l.sprite.name} object={l.sprite} />
      ))}
    </>
  );
}
