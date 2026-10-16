import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rig, useFlight } from '../store/flight';
import { CONTENT } from '../data/content';
import { DEG, RADAR_IDX, SEG, WP } from '../flight/route';
import { goToSection } from '../flight/scroll';
import { worldDir } from '../hud/combiner/projection';
import { addPickable } from '../input/picking';
import { radio } from '../hud/overlay/radioQueue';
import { contactInfo } from '../avionics/contacts';
import { EMISSIVE_GAIN } from './Effects';

/** Radio de la esfera sobre la que se dibujan (m): lejos de la cabina, dentro del plano lejano. */
const R = 900;
/** Tamaño angular del recuadro (grados): ~34 px en 720p, como en el prototipo. */
const BOX_DEG = 2.6;
const BOX_DEG_LOCKED = 2.0;
/** Distancia al waypoint RDR (m) dentro de la cual el radar "trabaja" con estos contactos. */
const AREA = SEG * 1.6;

// Canvas del rótulo: el recuadro a la izquierda y el texto a su derecha. El sprite se ancla en el
// centro del recuadro (sprite.center), para que el recuadro quede exactamente sobre el contacto.
const CW = 384, CH = 96, BOX = 64, BOX_CX = 4 + BOX / 2;

function makeLabel(i: number) {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, color: new THREE.Color().setScalar(EMISSIVE_GAIN) });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(BOX_CX / CW, 0.5);
  sprite.visible = false;
  sprite.renderOrder = 5;
  sprite.name = `contact_${CONTENT.contacts[i]!.id}`;
  return { canvas, ctx: canvas.getContext('2d')!, texture, material, sprite, text: '' };
}

function drawLabel(l: ReturnType<typeof makeLabel>, i: number, sub: string, locked: boolean) {
  const key = `${sub}|${locked}`;
  if (key === l.text) return; // sólo se redibuja (y se sube a la GPU) si cambió algo
  l.text = key;
  const c = CONTENT.contacts[i]!, g = l.ctx;
  const color = locked ? '#ff5a4f' : '#8dffa0';
  g.clearRect(0, 0, CW, CH);
  g.strokeStyle = g.fillStyle = g.shadowColor = color;
  g.shadowBlur = 8;
  g.lineWidth = 4;
  // Recuadro de designación: más pequeño cuando está fijado (el prototipo lo encoge 34 → 26 px).
  const b = locked ? BOX * (BOX_DEG_LOCKED / BOX_DEG) : BOX;
  g.strokeRect(BOX_CX - b / 2, CH / 2 - b / 2, b, b);
  g.font = "24px 'B612 Mono', monospace";
  g.textBaseline = 'middle';
  g.fillText(`${c.id} ${c.kind}`, BOX + 18, CH / 2 - 16);
  g.globalAlpha = 0.65;
  g.fillText(sub, BOX + 18, CH / 2 + 16);
  g.globalAlpha = 1;
  l.texture.needsUpdate = true;
}

/**
 * Contactos de radar en el cielo, por delante del waypoint RDR (posiciones en route.ts).
 *
 * Como en Ace Combat, lo que se ve es el RECUADRO DE DESIGNACIÓN (un sprite que siempre mira a la
 * cámara), y SÓLO si el radar lo detecta: su relación señal/ruido (ecuación del radar con su
 * distancia y su sección radar σ) debe superar el umbral. Así el dron aparece mucho más tarde que
 * el avión comercial.
 *
 * Se coloca en su dirección real sobre una esfera de R metros y se escala para que mida siempre
 * BOX_DEG grados: un objeto de lado L a distancia R subtiende 2·atan(L/2R), así que L = 2R·tan(θ/2).
 *
 * Cursor encima → se fija (rojo); clic → su análisis en la página RDR del MFD.
 */
export function Targets() {
  const camera = useThree((s) => s.camera);
  const labels = useMemo(() => CONTENT.contacts.map((_, i) => makeLabel(i)), []);
  const tmp = useMemo(() => ({ cam: new THREE.Vector3(), dir: new THREE.Vector3() }), []);

  useEffect(() => {
    const offs = labels.map((l, i) =>
      addPickable(l.sprite, {
        onHover: (hit) => {
          const s = useFlight.getState();
          if (hit && s.lockId !== i) {
            s.setLockId(i);
            const ci = contactInfo(i, rig.flight), c = CONTENT.contacts[i]!;
            radio('AWACS', `Contacto ${c.id} (${c.kind.toLowerCase()}) fijado: ${(ci.range / 1000).toFixed(1)} km, SNR ${ci.snr.toFixed(0)} dB.`, true);
          } else if (!hit && s.lockId === i) s.setLockId(-1);
          return true;
        },
        onClick: () => {
          const s = useFlight.getState();
          s.setSelContact(i);
          radio('AWACS', `Análisis de ${CONTENT.contacts[i]!.id} en tu pantalla.`, true);
          if (s.section !== RADAR_IDX) goToSection(RADAR_IDX);
          s.setMfdPage(0);
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
    const wp = WP[RADAR_IDX]!;
    const near = Math.hypot(f.navX - wp.x, f.navZ - wp.z) < AREA;
    camera.getWorldPosition(tmp.cam);

    labels.forEach((l, i) => {
      const ci = contactInfo(i, f);
      const visible = inside && near && ci.detected && Math.abs(ci.az) < 75 && ci.range > 300;
      l.sprite.visible = visible;
      // (Si se oculta estando fijado, el picking lo suelta en el siguiente movimiento del ratón:
      // aquí no se toca el store, que sería un setState por fotograma.)
      if (!visible) return;
      // worldDir: marco del mundo ya girado por el rumbo (delante +Z, derecha −X).
      l.sprite.position.copy(tmp.cam).addScaledVector(worldDir(ci.az, ci.el, tmp.dir), R);
      // Escala constante: BOX píxeles del canvas = BOX_DEG grados. El alto del sprite es entonces
      // 2R·tan(BOX_DEG/2) · (CH/BOX). Al fijarlo sólo se dibuja un recuadro más pequeño.
      const h = 2 * R * Math.tan((BOX_DEG * DEG) / 2) * (CH / BOX);
      l.sprite.scale.set(h * (CW / CH), h, 1);
      drawLabel(l, i, `${(ci.range / 1000).toFixed(1)} KM · ${ci.snr.toFixed(0)} dB`, s.lockId === i);
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
