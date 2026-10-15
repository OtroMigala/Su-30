# Cabina Su-30 — portafolio interactivo

## Objetivo
Sitio de portafolio personal (sin fines comerciales) donde el usuario "vuela" sentado en la cabina de un Su-30 de noche. El scroll recorre una ruta de waypoints; cada waypoint es una sección del sitio (perfil, proyectos, habilidades, contacto, créditos). La información se muestra con un HUD inspirado en la saga Ace Combat y en una pantalla interactiva (MFD) de la cabina. El usuario puede liberar la cámara con la tecla F para mirar alrededor.

Soy estudiante de ingeniería de telecomunicaciones y quiero aprender, no solo obtener código: explica en comentarios el porqué de cada técnica, especialmente la matemática y la física. Responde en español.

## Archivos de referencia
- `reference/cockpit-hud.html`: prototipo 2D funcional. Es la especificación de comportamiento y estética del HUD: menú tipo selector de armas, mensajes de radio con efecto de escritura, radar, cintas de velocidad y altitud, escalera de cabeceo, marcador NEXT, objetivos (proyectos) que se fijan con el cursor, botones físicos del MFD, MASTER CAUTION, tema día/noche y vista libre. Léelo completo antes de empezar y conserva su objeto `DATA` como fuente del contenido.
- `public/models/su30.glb`: modelo editado en Blender.

## Datos del modelo (verifícalos tú; pueden haber cambiado al editarlo)
- Original: "Su-30 MKI loadout#1 [Brahmos]" por abhinab.das000, CC BY 4.0, https://sketchfab.com/3d-models/su-30-mki-loadout1-brahmos-e9b810ba081544d0997ad8cce4b95fc8 (los créditos también están en `asset.extras` del GLB).
- 27.481 triángulos, 20 mallas, 15 materiales. Usa KHR_materials_emissive_strength y KHR_materials_specular.
- Tras cargarlo con GLTFLoader: nariz hacia +Z, arriba +Y, unidades en metros (envergadura ~15 m, largo ~22 m).
- Medidas del original en ese sistema: ojos del piloto delantero ≈ (0, 1.35, 5.6); vidrio del HUD centrado ≈ (0, 1.165, 6.31), de 0.18 × 0.19 m; cabeza del piloto trasero ≈ (0, 1.53, 4.1).
- Nombres que puse en Blender: `hud_combiner`, `panel_front`, `panel_rear`, `canopy_glass`, y los marcadores `cam_pilot`, `hud_anchor`, `mfd_main`. Si alguno falta, avísame y usa las medidas de arriba como respaldo.
- La cabina usa paneles planos con textura emisiva baja resolución; no intentes que se vea realista de cerca, deja que el HUD sea el protagonista.

## Stack
Vite + React + TypeScript, React Three Fiber (v9 estable), @react-three/drei, @react-three/postprocessing, GSAP con ScrollTrigger (todos sus plugins son gratis), Lenis, Zustand. Fuente B612 / B612 Mono (Google Fonts, OFL). Fija versiones exactas en package.json y verifica en npm la versión actual de cada paquete antes de instalar; no uses releases de menos de dos semanas. Si existen las skills oficiales de GSAP (`greensock/gsap-skills`), úsalas como guía.

## Arquitectura
src/
  data/content.ts        contenido (portado del DATA del prototipo)
  store/flight.ts        Zustand: progreso, sección activa, modo de cámara, selección de menú y proyecto
  flight/route.ts        waypoints, rumbo, altitud, giro coordinado (portado del prototipo, funciones puras con tests)
  scene/                 Canvas, Aircraft, Sky (Stars + luna), GroundLights (InstancedMesh o Points), CameraRig
  hud/combiner/          HUD dentro del vidrio (escalera, cintas, marcador de trayectoria, NEXT)
  hud/overlay/           HUD en pantalla en HTML: estado, radio, radar, menú, objetivos
  hud/mfd/               pantalla interactiva sobre `mfd_main`
  input/                 teclado y vista libre

## Comportamiento
1. Escena: noche con estrellas, luna y luces de ciudad en el suelo. El avión queda fijo en el origen; el mundo se mueve. El avión se inclina y cabecea según la ruta, y la cámara es hija del avión, así que el horizonte gira y la escalera del HUD lo sigue.
2. Scroll: ScrollTrigger convierte el scroll en progreso 0..1 sobre un contenedor alto, con `snap` a cada waypoint. Lenis suaviza el scroll. Recorrido: intro exterior (órbita lenta alrededor del avión), la cámara entra a la cabina hasta `cam_pilot`, y luego el vuelo por los waypoints.
3. Cámara: máquina de estados `exterior | cockpit | free | focus`. F alterna `free` (yaw ±75°, pitch ±35°, suavizado exponencial) y Esc vuelve. En `free` añade un pequeño desplazamiento de cabeza para que la cabina tenga paralaje y el HUD no (colimación al infinito). `focus` acerca la cámara al MFD al hacer clic en él.
4. HUD del combinador: dibuja la simbología en un plano lejano frente al avión (para que no tenga paralaje, como un HUD colimado real) y recórtala con el stencil buffer usando la malla `hud_combiner` como máscara. Escala del combinador configurable.
5. HUD en pantalla: HTML encima del canvas, portado del prototipo (estado, radio con aria-live, radar, menú, siluetas). Mantén texto real y enlaces accesibles.
6. MFD: CanvasTexture sobre `mfd_main` con el mismo contenido y estética del prototipo (verde fósforo, scanlines, bloom). Los clics se resuelven con raycast: la coordenada UV del impacto se traduce a coordenadas del canvas.
7. Proyectos como objetivos 3D en el cielo cerca de su waypoint; hover fija (rojo), clic muestra la ficha en el MFD.
8. Teclado: Q/E elige sección, Enter va, 1–6 salto directo, F vista libre, Esc soltar. En móvil, botón "MIRAR" y arrastre.

## Física (conservar del prototipo y documentar)
- Alabeo por giro coordinado: tan φ = v·ω / g.
- Factor de carga en el HUD: n = 1 / cos φ.
- Ángulo de trayectoria: γ = atan(Δh / Δs); el marcador de trayectoria va γ, y la nariz 2.5° más arriba (ángulo de ataque).
- Suavizado independiente del frame rate: k = 1 − e^(−λ·dt).
- Elevación de las luces del suelo: −atan(altitud / distancia).

## Rendimiento
- Comprime el modelo con `gltf-transform optimize` (Meshopt + WebP; KTX2 si no se ve mal) y configura los decodificadores.
- Meta: 60 fps en un celular de gama media; menos de 100 draw calls; pixel ratio máximo 2; `PerformanceMonitor` de Drei para bajar calidad si los fps caen.
- Nada de setState dentro de useFrame; muta por ref. Precompila shaders con `compileAsync` durante la pantalla de carga.
- Respeta `prefers-reduced-motion` (sin turbulencia, sin escritura animada).

## Licencias y créditos
- Página o sección de créditos y `CREDITS.md` con: el modelo (título, autor, enlace, CC BY 4.0), B612 (OFL), GSAP (GSAP Standard License), las librerías MIT usadas, e "interfaz inspirada en la saga Ace Combat (Bandai Namco)".
- No copies assets, logos ni tipografías de Ace Combat; replica el estilo con código propio.
- Solo usa dependencias y assets con licencias MIT, Apache 2.0, BSD, ISC, Zlib, CC0 o CC BY. Pregúntame antes de añadir cualquier otra.

## Fases (detente al final de cada una, muéstrame cómo probarla y haz commit)
0. Inspecciona el GLB (nodos, materiales, marcadores) y reporta qué encontraste y qué falta. Configura el proyecto.
1. Escena de noche con el avión, cámara exterior y luego dentro de la cabina en `cam_pilot`. Vidrio y paneles correctos.
2. Ruta de vuelo y scroll: waypoints, snap, alabeo, movimiento del mundo. Tests de las funciones de `route.ts`.
3. HUD en pantalla portado del prototipo, conectado al store.
4. HUD del combinador con stencil y escalera registrada al horizonte.
5. Vista libre (F) y modo focus.
6. MFD interactivo con raycast y objetivos 3D.
7. Post-procesado (bloom suave, grano leve), optimización, móvil, accesibilidad y créditos.

Antes de cada fase, explícame en pocas líneas el enfoque y por qué; si hay varias opciones, compáralas y recomienda una.