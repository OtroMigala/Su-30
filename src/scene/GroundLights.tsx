import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { rig } from '../store/flight';
import { DEG } from '../flight/route';
import { prefersReducedMotion } from '../flight/scroll';
import { rng } from './random';

/** Lado de la baldosa de terreno que se repite hasta el infinito (m). */
const TILE = 60000;
/** Radio de la esfera sobre la que se dibujan las luces (m); dentro de la cúpula (1500 m). */
const PROJ_RADIUS = 1300;
const COUNT = 6000;
const CITIES = 14;

/**
 * Genera las luces en el plano de una baldosa (x = este, y = norte, en metros):
 *  · ~60 % en ciudades: cada ciudad es una nube gaussiana 2D. Box–Muller da el radio
 *    r = σ·√(−2·ln U) (distribución de Rayleigh) con un ángulo uniforme; eso equivale a sumar dos
 *    gaussianas independientes en x e y: densa en el centro y cada vez más rala hacia fuera.
 *  · ~20 % en carreteras: puntos a lo largo del segmento entre dos ciudades, con poco desvío.
 *  · ~20 % sueltas: casas y pueblos dispersos, uniformes en la baldosa.
 */
function makeLights() {
  const rand = rng(4242);
  const cities = Array.from({ length: CITIES }, () => ({
    x: rand() * TILE, y: rand() * TILE, r: 500 + rand() * 1400,
  }));
  const pos = new Float32Array(COUNT * 3);
  const warm = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    let x: number, y: number;
    const kind = rand();
    if (kind < 0.6) {
      const c = cities[i % CITIES]!;
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(-2 * Math.log(rand() + 1e-9)) * c.r;
      x = c.x + Math.cos(a) * d;
      y = c.y + Math.sin(a) * d;
    } else if (kind < 0.8) {
      const a = cities[i % CITIES]!, b = cities[(i * 7 + 3) % CITIES]!;
      const t = rand();
      x = a.x + (b.x - a.x) * t + (rand() - 0.5) * 120;
      y = a.y + (b.y - a.y) * t + (rand() - 0.5) * 120;
    } else {
      x = rand() * TILE;
      y = rand() * TILE;
    }
    pos.set([x, y, 0], i * 3);
    warm[i] = rand() < 0.72 ? 1 : 0; // sodio (ámbar) o LED (blanco azulado), como en el prototipo
    phase[i] = rand() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aWarm', new THREE.BufferAttribute(warm, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return geometry;
}

const makeMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uPos: { value: new THREE.Vector2() },
      uAlt: { value: 900 },
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uTwinkle: { value: prefersReducedMotion() ? 0 : 1 },
      uTile: { value: TILE },
      uRadius: { value: PROJ_RADIUS },
      uWarm: { value: new THREE.Color(255 / 255, 200 / 255, 130 / 255) },
      uCool: { value: new THREE.Color(215 / 255, 228 / 255, 255 / 255) },
    },
    vertexShader: /* glsl */ `
      attribute float aWarm, aPhase;
      uniform vec2 uPos;
      uniform float uAlt, uTime, uPixelRatio, uTwinkle, uTile, uRadius;
      uniform vec3 uWarm, uCool;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        // 1) Vector horizontal avión → luz, con el terreno repetido cada uTile metros.
        //    mod(Δ + 1.5·T, T) − T/2 deja Δ en [−T/2, T/2): de todas las copias de la luz en las
        //    baldosas vecinas, elegimos la más cercana. Así el suelo es infinito con 6000 puntos.
        vec2 d = mod(position.xy - uPos + 1.5 * uTile, uTile) - 0.5 * uTile;
        float dist = length(d);

        // 2) Posición relativa real en el marco del mundo (x = −este, y = arriba, z = norte):
        //    la luz está uAlt metros por debajo. Su elevación aparente es atan2(−uAlt, dist),
        //    es decir −atan(h/d) (CLAUDE.md).
        vec3 rel = vec3(-d.x, -uAlt, d.y);

        // 3) Proyección sobre una esfera de radio fijo alrededor de la cámara. Para un objeto a
        //    kilómetros sólo importa su DIRECCIÓN (la cabeza del piloto se mueve centímetros: el
        //    paralaje es nulo). Al normalizar conservamos la dirección exacta y evitamos poner
        //    el plano lejano de la cámara a 40 km, que gastaría la precisión del depth buffer.
        vec3 p = normalize(rel) * uRadius;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);

        // 4) Tamaño y brillo con la distancia.
        //    · Extinción atmosférica (ley de Beer–Lambert): la luz que atraviesa un medio
        //      absorbente decae como e^(−d/L). L = 22 km es aire nocturno algo brumoso.
        //    · Las luces muy cercanas (justo debajo) se apagan: a −90° quedarían pegadas al
        //      fuselaje y no se ven desde la cabina.
        float size = clamp(2.4 - dist / 12000.0, 0.7, 2.4);
        gl_PointSize = max(size, 1.0) * uPixelRatio;
        float twinkle = mix(1.0, 0.75 + 0.25 * sin(uTime * 3.0 + aPhase), uTwinkle);
        vAlpha = max(exp(-dist / 22000.0), 0.08) * min(size, 1.0) * twinkle * smoothstep(300.0, 700.0, dist);
        vColor = mix(uCool, uWarm, aWarm);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.3, 1.0, r);
        gl_FragColor = vec4(vColor, a * vAlpha);
        #include <colorspace_fragment>
      }`,
  });

/**
 * Luces de ciudad en el suelo: UN solo draw call (THREE.Points) con todo el cálculo en la GPU.
 *
 * Igual que el cielo, el grupo copia la posición de la cámara y gira +ψ (rumbo) en Y; el avión
 * no se desplaza: es el shader el que mueve las luces restando la posición del avión (uPos).
 *
 * Points vs InstancedMesh: con Points cada luz es un vértice (12 bytes) y la GPU dibuja un
 * cuadrado de gl_PointSize píxeles; con InstancedMesh cada luz sería un quad con matriz propia
 * (64 bytes) que habría que orientar hacia la cámara. Para puntos de 1–3 px Points es lo idóneo.
 */
export function GroundLights() {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const geometry = useMemo(makeLights, []);
  const material = useMemo(makeMaterial, []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const f = rig.flight;
    camera.getWorldPosition(tmp);
    if (group.current) {
      group.current.position.copy(tmp);
      group.current.rotation.y = f.heading * DEG;
    }
    const u = material.uniforms;
    // Posición del avión en el mapa (x = este, z = norte). El desfase es arbitrario: sólo
    // elige qué zona de la baldosa queda bajo el primer waypoint (una con ciudades cerca).
    (u.uPos!.value as THREE.Vector2).set(f.x + TILE * 0.37, f.z + TILE * 0.61);
    u.uAlt!.value = f.alt;
    u.uTime!.value = state.clock.elapsedTime;
    u.uPixelRatio!.value = state.gl.getPixelRatio();
  });

  return (
    <group ref={group}>
      {/* frustumCulled = false: el shader mueve los vértices, así que la esfera envolvente que
          three calcula con las posiciones originales (la baldosa de 60 km) no sirve. */}
      <points geometry={geometry} material={material} renderOrder={-700} frustumCulled={false} />
    </group>
  );
}
