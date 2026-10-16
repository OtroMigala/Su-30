import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFlight } from '../store/flight';
import { toggleAutopilot } from '../flight/autopilot';
import { addPickable } from '../input/picking';
import { EMISSIVE_GAIN } from './Effects';

// Posición medida lanzando un rayo desde cam_pilot hacia el bloque de luces amarillo/blanco del
// antepecho izquierdo: cae en Object_11 a 0.96 m de los ojos, en un plano inclinado 15° hacia el
// piloto (normal (0, 0.259, −0.966)). El pulsador se apoya ahí, 4 mm por delante (sin z-fighting).
const SURFACE = new THREE.Vector3(0.2567, 0.941, 6.4252);
const NORMAL = new THREE.Vector3(0, 0.259, -0.966).normalize();
const W = 0.064, H = 0.032; // m
const CW = 256, CH = 128;

/**
 * Pulsador iluminado "A/P" (piloto automático), como los de los paneles de los cazas: verde con
 * el autopiloto conectado, ámbar "MAN" en vuelo manual y cian parpadeante mientras vuelve a la ruta.
 * Es hijo del grupo del avión (marco del cuerpo). Un clic alterna el modo (picking.ts).
 */
export function AutopilotButton() {
  const { mesh, ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color().setScalar(EMISSIVE_GAIN * 0.8) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), material);
    // Orientación: base ortonormal con z = normal de la superficie, y = el "arriba" del avión
    // proyectado sobre la superficie (Gram–Schmidt: y − (y·n)n) y x = y × z. Así el rótulo queda
    // derecho y mirando al piloto, sin la ambigüedad de girar +Z hacia una dirección casi opuesta.
    const z = NORMAL.clone();
    const y = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    mesh.position.copy(SURFACE).addScaledVector(NORMAL, 0.004);
    mesh.name = 'autopilot_button';
    return { mesh, ctx: canvas.getContext('2d')!, texture };
  }, []);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const pilot = useFlight.getState().pilot;
      const on = performance.now() % 700 < 450;
      const [label, color, lit] =
        pilot === 'auto' ? ['A/P', '#8dffa0', true] : pilot === 'manual' ? ['MAN', '#ffb84d', true] : ['A/P', '#7fd4ff', on];
      ctx.clearRect(0, 0, CW, CH);
      ctx.fillStyle = '#05080b';
      ctx.fillRect(0, 0, CW, CH);
      ctx.strokeStyle = '#2b333d';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, CW - 10, CH - 10);
      ctx.fillStyle = lit ? color : '#1d2a22';
      ctx.shadowColor = color;
      ctx.shadowBlur = lit ? 18 : 0;
      ctx.font = "bold 62px 'B612 Mono', monospace";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, CW / 2, CH / 2 + 4);
      ctx.shadowBlur = 0;
      texture.needsUpdate = true;
      // Sólo hace falta animar mientras parpadea (regreso a la ruta).
      raf = pilot === 'return' ? requestAnimationFrame(draw) : 0;
    };
    draw();
    const unsub = useFlight.subscribe((s, prev) => {
      if (s.pilot !== prev.pilot) {
        cancelAnimationFrame(raf);
        draw();
      }
    });
    const unpick = addPickable(mesh, { onClick: () => toggleAutopilot(), onHover: () => true });
    return () => {
      unsub();
      unpick();
      cancelAnimationFrame(raf);
      texture.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.geometry.dispose();
    };
  }, [mesh, ctx, texture]);

  return <primitive object={mesh} />;
}
