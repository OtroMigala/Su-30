import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { CameraRig } from './CameraRig';
import { prepareCockpit } from './cockpit';

export const MODEL_URL = '/models/su30.glb';

/**
 * El avión queda FIJO en el origen (CLAUDE.md): lo que se mueve es el mundo. En la fase 2 este
 * grupo recibirá alabeo y cabeceo, y como la cámara es hija suya, el horizonte girará solo.
 *
 * useGLTF(url, useDraco, useMeshopt): sin Draco (el modelo usa Meshopt) para no depender de un
 * decodificador en un CDN externo. El decodificador de Meshopt va incluido en drei.
 */
export function Aircraft() {
  const { scene } = useGLTF(MODEL_URL, false, true);
  const cockpit = useMemo(() => prepareCockpit(scene), [scene]);

  return (
    <group name="aircraft">
      <primitive object={scene} />
      <CameraRig cockpit={cockpit} />
      {/* Luz tenue dentro de la cabina: sin ella el asiento y los laterales son negro puro.
          No pretende ser realista, sólo que se distinga la estructura. */}
      <pointLight position={[0, 1.7, 5.2]} color="#7fb0ff" intensity={0.6} distance={3} decay={2} />
    </group>
  );
}

useGLTF.preload(MODEL_URL, false, true);
