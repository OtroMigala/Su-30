import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Aircraft } from './Aircraft';
import { Sky } from './Sky';
import { GroundLights } from './GroundLights';
import { useFlight } from '../store/flight';

/**
 * Precompila los shaders mientras se ve la pantalla de carga. Sin esto, el primer fotograma
 * que muestre cada material lo compilaría de golpe y la imagen se congelaría unos instantes.
 * compileAsync usa KHR_parallel_shader_compile: compila en paralelo sin bloquear el hilo.
 */
function Precompile() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    const done = () => !cancelled && useFlight.getState().setReady(true);
    gl.compileAsync(scene, camera).then(done, done);
    const safety = setTimeout(done, 8000); // por si el navegador nunca resuelve la promesa
    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, [gl, scene, camera]);
  return null;
}

export function Experience() {
  return (
    <Canvas
      className="stage"
      // dpr máximo 2 (CLAUDE.md): a 3x un celular pintaría 2.25 veces más píxeles sin ganancia visible.
      dpr={[1, 2]}
      // stencil: true → el HUD del combinador usa el stencil buffer como máscara. three.js lo trae
      // desactivado por defecto desde r163 (ahorra memoria a quien no lo usa).
      gl={{ powerPreference: 'high-performance', antialias: true, stencil: true }}
      // near=0.02: los paneles están a ~0.5 m; far=3000 contiene la cúpula (1500 m).
      camera={{ fov: 38, near: 0.02, far: 3000, position: [0, 4.5, 24] }}
    >
      <color attach="background" args={['#010309']} />
      <Sky />
      <GroundLights />
      <Suspense fallback={null}>
        <Aircraft />
        <Precompile />
      </Suspense>
    </Canvas>
  );
}
