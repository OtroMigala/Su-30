import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { prefersReducedMotion } from '../flight/scroll';
import { rig, useFlight } from '../store/flight';
import { damp } from '../flight/route';
import { rng } from './random';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const DEG = Math.PI / 180;
const DOME_RADIUS = 1500;
const STAR_RADIUS = 1200;
const MOON_DISTANCE = 1000;

// Posición de la luna, del prototipo: azimut 130° (rumbo de brújula: desde el norte, en sentido
// horario) y elevación 26°.
//
// Marco del "mundo" en three.js (lo comparten el cielo y el suelo): +Z = norte, +Y = arriba y
// −X = este. El este va en −X porque el modelo mira a +Z y, mirando a +Z con +Y arriba, la
// derecha del piloto es −X. Así, con rumbo 0 (nariz al norte), el este queda a su derecha, como
// en un mapa. Un punto de azimut b es entonces (−sen b·cos e, sen e, cos b·cos e).
const MOON_AZ = 130 * DEG;
const MOON_EL = 26 * DEG;
const MOON_DIR = new THREE.Vector3(
  -Math.sin(MOON_AZ) * Math.cos(MOON_EL),
  Math.sin(MOON_EL),
  Math.cos(MOON_AZ) * Math.cos(MOON_EL),
);
// Tamaño aparente: un disco de radio r a distancia D subtiende un ángulo θ con tan θ = r/D.
// La luna real mide 0.26°; la exageramos a 1.4° para que se aprecie en un FOV de 62°.
const MOON_RADIUS = MOON_DISTANCE * Math.tan(1.4 * DEG);
const MOON_COLOR = new THREE.Color('#e9eefc').multiplyScalar(3);

// ---- Tema: noche ⇄ amanecer (paletas del prototipo, tokens --sky-top, --sky-mid, --horizon...) ----
const THEME: [string, THREE.Color, THREE.Color][] = [
  ['uTop', new THREE.Color('#010309'), new THREE.Color('#16203d')],
  ['uMid', new THREE.Color('#05102a'), new THREE.Color('#3a4876')],
  ['uHorizon', new THREE.Color('#15243f'), new THREE.Color('#d4875c')],
  ['uGround', new THREE.Color('#04060a'), new THREE.Color('#17171d')],
  ['uGround2', new THREE.Color('#020305'), new THREE.Color('#0c0d12')],
  ['uHaze', new THREE.Color(0.35, 0.43, 0.66), new THREE.Color(1.0, 0.75, 0.55)],
];

// ---- Cúpula del cielo ----
// Colores del tema nocturno del prototipo. THREE.Color los pasa de sRGB (como se escriben)
// a lineal (como se hace la matemática de la luz); <colorspace_fragment> los devuelve a sRGB.
const domeMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color('#010309') },
      uMid: { value: new THREE.Color('#05102a') },
      uHorizon: { value: new THREE.Color('#15243f') },
      uHaze: { value: new THREE.Color(0.35, 0.43, 0.66) },
      uGround: { value: new THREE.Color('#04060a') },
      uGround2: { value: new THREE.Color('#020305') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position; // la esfera está centrada en la cámara: la posición ES la dirección
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uGround, uGround2, uHaze;
      varying vec3 vDir;
      void main() {
        float e = normalize(vDir).y; // seno de la elevación: 0 en el horizonte, 1 en el cenit
        vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.25, e));
        sky = mix(sky, uTop, smoothstep(0.2, 0.9, e));
        vec3 ground = mix(uGround, uGround2, smoothstep(0.0, 0.35, -e));
        vec3 col = e >= 0.0 ? sky : ground;
        // Bruma del horizonte: decae exponencialmente con la distancia angular a la línea.
        col += uHaze * (0.2 * exp(-abs(e) * 28.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });

// ---- Estrellas ----
function useStars() {
  return useMemo(() => {
    const N = 1400;
    const rand = rng(1337);
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const phase = new Float32Array(N);
    const mag = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // Sólo hemisferio superior (el suelo las taparía). Si el seno de la elevación es
      // uniforme en [0,1], los puntos quedan uniformes sobre la superficie de la semiesfera
      // (teorema de Arquímedes: el área de una zona esférica es proporcional a su altura).
      const y = rand();
      const az = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(az) * r * STAR_RADIUS, y * STAR_RADIUS, Math.sin(az) * r * STAR_RADIUS], i * 3);
      const m = rand();
      mag[i] = 0.35 + m * 0.65;
      size[i] = m > 0.93 ? 3.2 : 2.0; // en píxeles CSS
      phase[i] = rand() * 6.28;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geometry.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uTwinkle: { value: prefersReducedMotion() ? 0 : 1 }, uBright: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSize, aPhase, aMag;
        uniform float uTime, uPixelRatio, uTwinkle, uBright;
        varying float vAlpha;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio; // sin atenuación por distancia: las estrellas están en el infinito
          // Centelleo como en el prototipo: brillo × (0.8 + 0.2·sin), cada estrella con su fase.
          // Con prefers-reduced-motion, uTwinkle = 0 y el brillo queda fijo.
          float twinkle = 0.8 + 0.2 * sin(uTime * 2.0 + aPhase);
          vAlpha = aMag * mix(1.0, twinkle, uTwinkle) * uBright;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;   // 0 en el centro, 1 en el borde del punto
          float a = 1.0 - smoothstep(0.0, 1.0, r);        // disco suave
          gl_FragColor = vec4(vec3(0.9, 0.93, 1.0), a * vAlpha);
          #include <colorspace_fragment>
        }`,
    });
    return { geometry, material };
  }, []);
}

function useHaloTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(220,230,255,.55)');
    grad.addColorStop(0.15, 'rgba(220,230,255,.18)');
    grad.addColorStop(1, 'rgba(220,230,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/**
 * Cielo nocturno. Todo (cúpula, estrellas, luna) cuelga de un grupo que COPIA LA POSICIÓN de la
 * cámara cada fotograma pero no su rotación: así el cielo se ve "en el infinito" y no tiene
 * paralaje. Si fuera fijo, al orbitar 24 m la luna (a 1000 m) se desplazaría ~1.4°.
 * La luz lunar va aparte, en el origen, para que su dirección no cambie al seguir a la cámara.
 *
 * Rumbo: el avión no gira en guiñada; es el cielo el que gira rotation.y = +ψ. Con la rotación
 * Ry(ψ), un punto de azimut b acaba en (−sen(b−ψ), ·, cos(b−ψ)): azimut relativo b − ψ, que es
 * justo dónde lo ve el piloto (si vuelas a 130°, la luna de azimut 130° queda delante).
 * La luz lunar gira con el mismo ángulo para que la luz venga de donde se ve la luna.
 */
export function Sky() {
  const follow = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const dome = useMemo(domeMaterial, []);
  const stars = useStars();
  const halo = useHaloTexture();
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const moonLight = useRef<THREE.DirectionalLight>(null);
  const moonLightPivot = useRef<THREE.Group>(null);
  const skyLight = useRef<THREE.HemisphereLight>(null);

  useFrame((state, dt) => {
    camera.getWorldPosition(tmp);
    const heading = rig.flight.heading * DEG;
    if (follow.current) {
      follow.current.position.copy(tmp);
      follow.current.rotation.y = heading;
    }
    if (moonLightPivot.current) moonLightPivot.current.rotation.y = heading;

    // Al entrar en la cabina se atenúan las luces: el exterior necesita luz para verse, pero un
    // interior nocturno debe ser oscuro para que los instrumentos emisivos (y luego el HUD)
    // sean los protagonistas. La luna entra por el canopy y, sin esto, pinta el marco de azul.
    const k = smoothstep(0.6, 1, rig.enter);
    if (moonLight.current) moonLight.current.intensity = THREE.MathUtils.lerp(1.6, 0.3, k);
    if (skyLight.current) skyLight.current.intensity = THREE.MathUtils.lerp(0.55, 0.14, k);
    // Tema (D/N del MFD): mezcla suave de los colores de noche a los de amanecer del prototipo.
    // Al amanecer el cielo es más claro y apenas se ven estrellas (35 %, como el prototipo).
    rig.dawn = damp(rig.dawn, useFlight.getState().theme === 'dawn' ? 1 : 0, 2, Math.min(dt, 0.05));
    const u = dome.uniforms, d = rig.dawn;
    for (const [name, night, dawn] of THEME) (u[name]!.value as THREE.Color).lerpColors(night, dawn, d);
    stars.material.uniforms.uBright!.value = THREE.MathUtils.lerp(1, 0.35, d);
    stars.material.uniforms.uTime!.value = state.clock.elapsedTime;
    stars.material.uniforms.uPixelRatio!.value = state.gl.getPixelRatio();
  });

  return (
    <>
      <group ref={follow}>
        <mesh material={dome} renderOrder={-1000} frustumCulled={false}>
          <sphereGeometry args={[DOME_RADIUS, 32, 16]} />
        </mesh>
        <points geometry={stars.geometry} material={stars.material} renderOrder={-900} frustumCulled={false} />
        <group position={MOON_DIR.clone().multiplyScalar(MOON_DISTANCE)}>
          <mesh renderOrder={-800}>
            <sphereGeometry args={[MOON_RADIUS, 24, 16]} />
            {/* Color × 3 en HDR: la luna es lo más brillante del cielo y así el bloom la hace brillar. */}
            <meshBasicMaterial color={MOON_COLOR} />
          </mesh>
          {/* Resplandor: un sprite (siempre de cara a la cámara) con degradado radial, suma luz. */}
          <sprite scale={[MOON_RADIUS * 14, MOON_RADIUS * 14, 1]} renderOrder={-850}>
            <spriteMaterial map={halo} blending={THREE.AdditiveBlending} depthWrite={false} />
          </sprite>
        </group>
      </group>
      <group ref={moonLightPivot}>
        <directionalLight ref={moonLight} position={MOON_DIR.clone().multiplyScalar(100)} color="#a9bcff" intensity={1.6} />
      </group>
      {/* Luz ambiental azulada y tenue: la que llega del cielo nocturno y rebota en el suelo. */}
      <hemisphereLight ref={skyLight} args={['#2a3a66', '#05070c', 0.55]} />
    </>
  );
}
