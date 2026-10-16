import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { CombinerHud } from '../hud/combiner/CombinerHud';
import { Mfd } from '../hud/mfd/Mfd';
import { prepareCockpit } from './cockpit';
import { rig } from '../store/flight';
import { DEG, stepFlight } from '../flight/route';
import { prefersReducedMotion } from '../flight/scroll';

export const MODEL_URL = '/models/su30.glb';

/**
 * El avión queda FIJO en el origen (CLAUDE.md): lo que se mueve es el mundo. Este grupo sólo
 * recibe cabeceo y alabeo; como la cámara es hija suya, desde la cabina es el horizonte el que
 * gira (que es lo que ve un piloto). El rumbo no se aplica aquí, sino al revés en el mundo:
 * el cielo y el suelo giran −ψ alrededor del avión (Sky.tsx, GroundLights.tsx).
 *
 * Por qué el mundo se mueve y no el avión: la ruta mide 70 km. Si el avión viajara por ella,
 * la cámara estaría a decenas de km del origen y los float32 de la GPU (7 cifras significativas)
 * sólo darían resolución de milímetros a centímetros: la cabina, que está a medio metro de la
 * cámara, temblaría. Con el avión en el origen, lo que necesita precisión está siempre cerca de 0.
 *
 * useGLTF(url, useDraco, useMeshopt): sin Draco (el modelo usa Meshopt) para no depender de un
 * decodificador en un CDN externo. El decodificador de Meshopt va incluido en drei.
 */
export function Aircraft() {
  const { scene } = useGLTF(MODEL_URL, false, true);
  const cockpit = useMemo(() => prepareCockpit(scene), [scene]);
  const group = useRef<THREE.Group>(null);
  const motion = useMemo(() => (prefersReducedMotion() ? 0 : 1), []);

  // Prioridad −20: el vuelo se integra ANTES que la cámara (−10) y que el cielo (0), que leen
  // su resultado en el mismo fotograma.
  useFrame((_, dt) => {
    // dt limitado a 50 ms: tras una pestaña en segundo plano, dt podría ser de varios segundos
    // y el ω = Δψ/dt calculado sería absurdo.
    const f = stepFlight(rig.flight, rig.s, Math.min(dt, 0.05), motion);
    const g = group.current;
    if (!g) return;
    // Euler en orden 'XYZ' (matriz Rx·Ry·Rz). Leído como rotaciones INTRÍNSECAS (sobre los ejes
    // del propio avión): primero cabecea sobre X (eje de las alas) y después alabea sobre la Z
    // ya cabeceada (el eje de la nariz). Es el orden de los ángulos de Euler aeronáuticos
    // (ψ, θ, φ), con ψ = 0 porque el rumbo lo pone el mundo.
    //  · Cabeceo: girar +Z (nariz) hacia +Y exige un ángulo NEGATIVO sobre X (regla de la mano
    //    derecha: +X apunta al ala izquierda del piloto en este modelo).
    //  · Alabeo: el ala derecha está en −X; un ángulo positivo sobre Z la baja (giro a la derecha).
    g.rotation.set(-f.pitch * DEG, 0, f.roll * DEG);
  }, -20);

  return (
    <group name="aircraft" ref={group}>
      <primitive object={scene} />
      <CameraRig cockpit={cockpit} root={scene} />
      <CombinerHud cockpit={cockpit} root={scene} />
      {cockpit.mfd && <Mfd mesh={cockpit.mfd} />}
      {/* Luz tenue dentro de la cabina: sin ella el asiento y los laterales son negro puro.
          No pretende ser realista, sólo que se distinga la estructura. */}
      <pointLight position={[0, 1.7, 5.2]} color="#7fb0ff" intensity={0.6} distance={3} decay={2} />
    </group>
  );
}

useGLTF.preload(MODEL_URL, false, true);
