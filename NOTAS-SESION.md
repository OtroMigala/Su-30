# Notas de sesión — Cabina Su-30

Complemento de `CLAUDE.md` (que sigue siendo la especificación). Aquí está lo que se decidió y
descubrió trabajando, para retomar en otro PC sin perder contexto. Última actualización: 2026-10-15.

> Para que Claude Code lo lea siempre: añade la línea `@NOTAS-SESION.md` al final de `CLAUDE.md`,
> o pídele "lee NOTAS-SESION.md" al empezar.

## Estado

| Fase | Estado | Commit |
| --- | --- | --- |
| 0 Inspección del GLB + proyecto | hecha | `8edfc60` |
| (extra) pipeline de optimización del GLB + prototipo en `reference/` | hecha | `0e8bdfe` |
| 1 Escena nocturna, avión, entrada a la cabina | hecha | `5dfb5a4` |
| 2 Ruta de vuelo y scroll (waypoints, snap, alabeo, tests de `route.ts`) | hecha | (commit de la fase 2) |
| 3 HUD en pantalla portado del prototipo | **siguiente** | |
| 4–7 | pendientes | |

Forma de trabajo pedida: antes de cada fase, explicar el enfoque en pocas líneas (comparando opciones
y recomendando una); al final, detenerse, explicar cómo probarla y hacer commit. Responder en español y
comentar el porqué de cada técnica, sobre todo la matemática y la física (el usuario estudia telecomunicaciones).

## Entorno y dependencias

- Node 24, npm 11, Windows 11. Se necesita Node ≥ 22.12 (Vite 8 y Vitest 5).
- Versiones **exactas** (sin `^`), todas con ≥ 14 días de publicadas al instalarlas: React 19.3.0, three 0.186.1,
  R3F 9.8.1, drei 10.7.9, @react-three/postprocessing 3.1.3, postprocessing 6.39.5, GSAP 3.15.0, Lenis 1.3.26,
  Zustand 5.0.15, Vite 8.3.2, TypeScript 7.0.2, Vitest 5.0.3, @gltf-transform/* 4.5.1, meshoptimizer 1.3.0, sharp 0.35.5.
- Restricciones de compatibilidad que fijan versiones: `postprocessing` exige three < 0.187; R3F exige React < 19.4.
- Para elegir versiones se consultó `npm view <pkg> time`; ojo, ordenar por semver falla con three (aparece una "1.58.1" antigua): ordenar por fecha.
- Licencias: sólo MIT, Apache-2.0, BSD, ISC, Zlib, CC0, CC BY (y GSAP Standard License, permitida en CLAUDE.md).
  El autor **aceptó** (2026-10-15) las herramientas de build con MPL-2.0 (lightningcss, dentro de Vite), LGPL-3.0 (binario de sharp)
  y BlueOak-1.0.0 (gltf-transform); ninguna se distribuye. Cualquier otra licencia nueva: preguntar antes.
- Las skills oficiales de GSAP (`greensock/gsap-skills`) no estaban disponibles; se usa la documentación.

## Modelo 3D y pipeline

- Flujo: `assets-src/su30.glb` (export de Blender, sin tocar) → `npm run optimize:glb` → `public/models/su30.glb` (lo que carga la web).
  **Tras cada re-exportación de Blender hay que volver a ejecutar el optimizador.** `npm run inspect:glb` audita la fuente.
- El `.blend` y el GLB original de Sketchfab NO están en el repo (estaban en Descargas del PC original).
- Resultado de la optimización: 3.34 MB → 0.39 MB, 111 → 14 draw calls. Texturas grandes a 512 px WebP calidad 60
  (opciones `--tex` y `--quality`; el usuario pidió "mínima calidad", interpretado como compresión agresiva). Sin KTX2 (requiere `toktx`).
  Sin Draco: el modelo usa Meshopt (`useGLTF(url, false, true)`).
- Hallazgos del GLB editado: 111 mallas (los dos pilotos eran 92 triángulos sueltos); 4 cuadritos sueltos de las alas dentro de
  `canopy_glass` (8 triángulos, inflaban su caja a 14.8 m); `asset.extras` con los créditos CC BY lo borró el export de Blender
  (el optimizador los reinyecta); `KHR_materials_specular` ya no está; 27.468 triángulos (no 27.481).
- Trampas del optimizador: `prune()` y `join()` borran por defecto los nodos hoja vacíos, que es lo que son `cam_pilot` y `hud_anchor`
  (por eso `keepLeaves: true` y `cleanup: false`). El script falla si falta algún nodo requerido.
- Nodos con significado: `cam_pilot` (0, 1.243, 5.554), `hud_anchor` (0, 1.149, 6.355), `hud_combiner`, `panel_front`, `panel_rear`,
  `canopy_glass`, `mfd_main`, y los añadidos por el optimizador `pilot_front` / `pilot_rear`.
- `cam_pilot` queda dentro de la cabeza del piloto delantero (cáscara hueca): se oculta `pilot_front` en primera persona (t > 0.8 de la entrada).
- Desde `cam_pilot`, `hud_anchor` queda 6.7° por debajo de la horizontal. `hud_combiner` es un trapecio inclinado ~40° de 10 triángulos con
  tiras irregulares: si la máscara de stencil (fase 4) sale rara, retocarlo.
- `panel_front` tiene tres pantallas planas (centros x = −0.312, 0.108, 0.313; 0.157 m de lado; inclinadas ~15°).

### `mfd_main` (pendiente de corregir en Blender)

- Problema original: el plano miraba hacia delante, lejos del piloto (normal (0, −0.25, +0.97)), con la textura espejada, y flotaba 3.7 cm
  delante de la pantalla central de `panel_front`.
- Hoy lo corrige el código, **auto-detectado** (`fixMfd` en `src/scene/cockpit.ts`; se apaga con `MFD_AUTOFIX = false` o solo, cuando el GLB ya esté bien).
- A mano en Blender: modo objeto, `R Y Y 180`; opcional: centro glTF (0.108, 0.6675, 6.4146) = Blender (0.108, −6.4146, 0.6675) y escala uniforme ≈ 0.0787.
  Verificar con `npm run inspect:glb` ("mira al piloto ✓", "no espejada ✓"). Luego se puede borrar `fixMfd`.
- El material del MFD es una textura provisional (rejilla con rótulos) hecha en `createMfdPlaceholder`. **`flipY = false`**: glTF pone v=0 arriba,
  así el raycast de la fase 6 traduce UV → canvas directamente (x = u·ancho, y = v·alto).

## Arquitectura implementada (fase 1)

- `src/store/flight.ts`: Zustand con `ready` y `camMode` (`exterior | cockpit | free | focus`), y el objeto mutable **`rig.enter`** (0 órbita → 1 cabina).
  Regla: nada de `setState` dentro de `useFrame`; lo que cambia por fotograma va en `rig` y se muta.
- (Fase 1 tenía `intro.ts` + `EntryButton`; la fase 2 los eliminó: ahora el scroll controla `rig.enter`.)
- `src/scene/Aircraft.tsx`: grupo fijo en el origen; contiene el GLB, la cámara (`<primitive object={camera}/>` → cámara hija) y una luz tenue interior.
- `src/scene/CameraRig.tsx`: posición = Bézier cuadrática P0 (órbita, radio 24 m, altura 4.5 m) → P1 `APPROACH` (0, 3.4, 3.6) → P2 `cam_pilot`.
  Una recta atravesaría el fuselaje opaco; la curva sólo cruza el cristal. FOV 38° → 62°. `useFrame` con prioridad −10 (¡una prioridad positiva
  desactiva el render automático de R3F!). Cabina inclinada `COCKPIT_PITCH` = −8° para que el MFD entre en el campo vertical (±31°); revisar en fases 4 y 5.
- `src/scene/Sky.tsx`: cúpula con shader de degradado, estrellas con shader propio (sólo hemisferio superior), luna (azimut 130°, elevación 26°, 1.4° de radio)
  y luz lunar. El cielo copia la posición de la cámara pero no su rotación (sin paralaje). Las luces se atenúan al entrar (smoothstep sobre `rig.enter`).
  En la fase 2 el cielo y la luz lunar deben girar con el rumbo (el avión no se mueve; se mueve el mundo).
- `src/scene/cockpit.ts`: `prepareCockpit` (idempotente: useGLTF cachea la escena y StrictMode duplica efectos): marcadores con respaldo a las medidas del CLAUDE.md,
  `renderOrder` de transparencias (cristal 1, combinador 2, MFD 3), combinador a 12 % de opacidad, y el arreglo del MFD.
- `src/hud/overlay/Loader.tsx`: pantalla de carga (`useProgress`), se retira al terminar `compileAsync`. `Experience.tsx` lo dispara (con respaldo de 8 s).
- Canvas: `dpr=[1,2]`, cámara `near=0.02`, `far=3000`.
- Parámetros de depuración (sólo en `npm run dev`): `/?p=0.08` (progreso del scroll), `/?sec=2` (waypoint 2), `&theta=-40&ly=16` (cámara exterior).

## Arquitectura añadida (fase 2)

- `src/data/content.ts`: el `DATA` del prototipo (`CONTENT`), con los créditos del modelo ya corregidos.
- `src/flight/route.ts`: funciones puras + `stepFlight` (muta un `FlightState`, sin asignar memoria). Tests en `route.test.ts` (22).
  Rumbo en grados de brújula; mapa x = este, z = norte. Alabeo del prototipo: ω = Δψ/dt ⇒ el avión se inclina sólo
  mientras haces scroll en una curva y nivela al parar (decisión: así se lee cada sección con el horizonte recto).
  En el waypoint el rumbo está a mitad del giro (p. ej. 97° en WP1): el giro termina R_TURN/4 después, como en el prototipo.
- Reparto del scroll: N tramos iguales (1/N cada uno): el primero es la entrada a la cabina, los otros N−1 la ruta.
  Snap cada 1/N (7 puntos: exterior + 6 waypoints). `FlightTrack` mide N·120vh + 100vh.
- `src/flight/scroll.ts`: Lenis (lerp 0.09, movido por `gsap.ticker`, `lagSmoothing(0)`) + un ScrollTrigger con snap
  (delay 0.25 s, sin inercia). Sin Lenis con `prefers-reduced-motion`. `history.scrollRestoration = 'manual'`: recargar empieza fuera.
  La sección activa se publica en el store tras 0.18 s estable. `goToSection(i)` listo para el menú/teclado de la fase 3.
- `store/flight.ts`: `rig.progress`, `rig.s`, `rig.flight` (estado del vuelo) y `section` reactiva.
- `Aircraft.tsx`: `useFrame` prioridad −20 integra el vuelo y aplica cabeceo (−X) y alabeo (+Z) al grupo del avión (Euler XYZ).
- Marco del mundo en three: +Z norte, −X este, +Y arriba; cielo, luz lunar y suelo giran `rotation.y = +ψ`. La luna pasó a
  esta convención (azimut 130° de brújula).
- `GroundLights.tsx`: 6000 `Points` (ciudades gaussianas, carreteras, dispersas) en una baldosa de 60 km repetida con `mod`
  en el shader; cada luz se proyecta a una esfera de 1300 m alrededor de la cámara (sólo importa la dirección; `far` sigue en 3000).
  Brillo con extinción de Beer–Lambert e^(−d/22 km).
- `FlightReadout.tsx`: lectura provisional (HDG, ALT, BANK, G, γ) escrita por rAF a 10 Hz; **la fase 3 la sustituye por el HUD**.
  `ScrollHint.tsx`: indicación en el exterior.
- Aviso inofensivo en consola: "THREE.Clock deprecated" viene de R3F, no del proyecto.

## Cómo se verificó visualmente (no hay GPU en las pruebas automáticas)

Capturas con Chrome sin interfaz y `puppeteer-core` instalado **fuera del repo** (en la carpeta temporal), WebGL por software (SwiftShader):
`--use-angle=swiftshader --enable-unsafe-swiftshader`, abrir `http://localhost:<puerto>/?enter=1`, esperar a que `.loader` tenga la clase `done` y capturar.
Con SwiftShader no se pueden medir fps ni existe `KHR_parallel_shader_compile`. Los fps reales los tiene que probar el usuario en su equipo.

## Física del prototipo a portar (fase 2 y siguientes)

Fuente completa: `reference/cockpit-hud.html` (objeto `DATA` = contenido del sitio; 6 secciones, rutas, waypoints, MFD, radio...).

- Alabeo de giro coordinado: tan φ = v·ω / g (v = 230 m/s de referencia, ω limitado a ±0.45 rad/s, φ a ±65°).
- Factor de carga: n = 1 / cos φ.
- Ángulo de trayectoria: γ = atan(Δh / Δs); el marcador de trayectoria va a γ y la nariz a γ + 2.5° (ángulo de ataque).
- Suavizado independiente del frame rate: k = 1 − e^(−λ·dt).
- Elevación de las luces del suelo: −atan(altitud / distancia).
- Ruta: 14 km entre waypoints, rumbos por tramo [30, 105, 165, 110, 45]°, giro que empieza 4.2 km antes del waypoint con `smoothstep`,
  altitudes por sección [900, 2200, 3000, 2600, 3400, 4200] m. Vista libre: yaw ±75°, pitch ±35°, suavizado λ = 7.

## Pendientes y avisos

- Bundle de JS: 1.28 MB (363 KB gzip), casi todo three; revisar en la fase 7 (code-splitting, `PerformanceMonitor`).
- Marco del canopy muy azul de noche (luna a través del cristal): se puede oscurecer en `Sky.tsx` (`lerp(1.6, 0.3, k)`).
- Fuentes B612 vía Google Fonts (enlace en `index.html`); OFL permite autoalojarlas si se quiere funcionar sin conexión.
- `CREDITS.md` está en borrador; se completa en la fase 7 junto con la página de créditos.
- Modo móvil en vertical: FOV vertical fijo de 62° deja poco ancho; tratar en la fase 7.
