import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Effects } from './Effects';
import { Aircraft } from './Aircraft';
import { Sky } from './Sky';
import { GroundLights } from './GroundLights';
import { Targets } from './Targets';
import { initPicking } from '../input/picking';
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

/**
 * Calidad adaptativa. PerformanceMonitor mide los fps en ventanas de tiempo y llama a onDecline
 * si bajan del umbral (o a onIncline si sobran). En calidad baja: dpr 1 (en un móvil con pantalla
 * 3× se pintan hasta 4 veces menos píxeles que con dpr 2), sin MSAA y el HUD a 30 Hz.
 * flipflops: si alterna más de 3 veces entre subir y bajar, se queda en baja (onFallback) para no
 * oscilar. La calidad nunca supera dpr 2 (CLAUDE.md).
 */
function Quality() {
  const setDpr = useThree((s) => s.setDpr);
  const low = useFlight((s) => s.quality === 'low');
  useEffect(() => setDpr(low ? 1 : Math.min(devicePixelRatio, 2)), [low, setDpr]);
  const set = (q: 'high' | 'low') => () => useFlight.getState().setQuality(q);
  return <PerformanceMonitor onDecline={set('low')} onIncline={set('high')} onFallback={set('low')} flipflops={3} />;
}

/** Sólo en desarrollo: /?fx=0 desactiva el post-procesado y /?debug expone el renderer (draw calls). */
const DEV_FX = !import.meta.env.DEV || new URLSearchParams(location.search).get('fx') !== '0';
function DebugInfo() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug')) (window as unknown as { __gl: unknown }).__gl = gl;
  }, [gl]);
  return null;
}

/** Conecta el picking (MFD, objetivos) a la cámara y al canvas. */
function Picking() {
  const { gl, camera } = useThree();
  useEffect(() => initPicking(camera, gl.domElement), [gl, camera]);
  return null;
}

export function Experience() {
  return (
    <Canvas
      className="stage"
      // Para lectores de pantalla la vista 3D es una imagen; el contenido real está en el HTML.
      role="img"
      aria-label="Vista desde la cabina de un Su-30 volando de noche sobre una ciudad, con el HUD encendido"
      // dpr máximo 2 (CLAUDE.md): a 3x un celular pintaría 2.25 veces más píxeles sin ganancia visible.
      dpr={[1, 2]}
      // stencil: true → el HUD del combinador usa el stencil buffer como máscara. three.js lo trae
      // desactivado por defecto desde r163 (ahorra memoria a quien no lo usa).
      // antialias sólo sin post-procesado: con él, el MSAA lo hace el render target del composer y
      // el del lienzo sería memoria desperdiciada.
      gl={{ powerPreference: 'high-performance', antialias: !DEV_FX, stencil: true }}
      // near=0.02: los paneles están a ~0.5 m; far=3000 contiene la cúpula (1500 m).
      camera={{ fov: 38, near: 0.02, far: 3000, position: [0, 4.5, 24] }}
    >
      <color attach="background" args={['#010309']} />
      <Sky />
      <GroundLights />
      <Targets />
      <Picking />
      <Quality />
      <DebugInfo />
      {DEV_FX && <Effects />}
      <Suspense fallback={null}>
        <Aircraft />
        <Precompile />
      </Suspense>
    </Canvas>
  );
}
