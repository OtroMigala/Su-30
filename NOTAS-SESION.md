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
| 3 HUD en pantalla portado del prototipo | hecha | (commit de la fase 3) |
| 4 HUD del combinador con stencil | hecha | (commit de la fase 4) |
| 5 Vista libre (F) y modo focus | hecha | (commit de la fase 5) |
| 6 MFD interactivo con raycast y objetivos 3D | hecha | (commit de la fase 6) |
| 7 Post-procesado, optimización, móvil, accesibilidad, créditos | hecha | (commit de la fase 7) |
| 8 (extra) Vuelo manual, piloto automático, panel en alta resolución | hecha | (commit de la fase 8) |

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
  y BlueOak-1.0.0 (gltf-transform); ninguna se distribuye. También aceptó (2026-10-15) ffmpeg como herramienta de build
  y la **Pixabay Content License** para dos sonidos, con la condición de no subir los originales a git.
  Cualquier otra licencia nueva: preguntar antes.
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

## Controles W/S y sonido (añadido tras la fase 2, a petición del autor)

- W/S (KeyboardEvent.code, físico) mueven el MISMO scroll: `setThrottleDir` en `scroll.ts`. Velocidad de crucero 1 tramo / 3.5 s,
  aceleración con damp λ = 1.8. Al soltar: planeo con deceleración constante (`power1.out`, T = 2d/v₀) hasta el siguiente waypoint
  en la dirección de avance; nunca retrocede. La rueda y el táctil siguen funcionando (snap al más cercano) y cancelan el planeo.
  Decisiones del autor: W/S principal + rueda; al soltar, siguiente waypoint.
- `src/input/keyboard.ts`: W, S, M (silencio, guardado en localStorage). Las teclas de la fase 3 (Q/E/Enter/1–6) van aquí.
- `src/audio/engine.ts`: Web Audio. Ambiente en bucle a volumen 0.16 siempre; con W/S, arranque (spool) y a los 2.2 s fundido
  de 1 s al empuje en bucle; al soltar, decae con τ = 0.25 s; si se vuelve a acelerar en < 1.5 s no se repite el arranque.
  El AudioContext se crea en la primera tecla o clic (política de autoplay). Botón `SoundToggle` (SND ON/OFF).
- Sonidos: originales en `assets-src/sounds/` (en .gitignore) → `npm run sounds` (necesita ffmpeg; winget Gyan.FFmpeg, o variable FFMPEG)
  → `public/sounds/{ambient,spool,thrust}.{webm,mp3}` (Opus 64k + MP3 96k, mono, loudnorm −18 LUFS). Cortes justificados en el script.

## Arquitectura añadida (fase 3)

- `src/hud/overlay/Hud.tsx`: contenedor del HUD HTML (z-index 4, `inert` y opacidad 0 en el exterior). Anuncia por radio cada
  sección al llegar y, al entrar a la cabina, la sección actual.
- `Status` (TIME por setInterval escribiendo en el DOM, PILOT, WPT), `Radio` + `radioQueue.ts` (cola imperativa con escritura;
  la parte visible es aria-hidden y una región `role=status` oculta recibe el mensaje completo una vez), `KeysHelp`,
  `Radar` (canvas 2D con rAF propio, heading-up, alcance 30 km, usa `posAt(s)` sin deriva), `WeaponMenu` (botones en `<nav>`;
  `aria-current="location"` = sección activa, clase `sel` = cursor de Q/E).
- OJO Windows: `Radio.tsx` y `radio.ts` chocan (rutas sin distinción de mayúsculas) → el módulo se llama `radioQueue.ts`.
- `route.ts`: `PROJ_IDX`, `TARGETS` (objetivos de proyectos, del prototipo) y `radarPoint` (con tests, 24 en total).
- Teclado: Q/E (cursor, módulo N), Enter (vuela a la selección; no si el foco está en botón/enlace), 1–6 (Digit/Numpad).
  `goToSection` suena el motor durante el vuelo automático (Lenis 2.2 s) y lo apaga al llegar o si el usuario usa la rueda.
- Contenido accesible: `FlightTrack` (`<main>`) lleva `<h1>` y una `<section>` por waypoint con texto real y enlaces,
  colocada a (i+1)·120vh. Con Tab, la sección con foco se muestra como panel (`:focus-within`) y el avión vuela a ella.
  Su versión visual definitiva será el MFD (fase 6).
- `FlightReadout` ya sólo con `/?debug` en desarrollo. Mensaje de radio inicial cambiado a "Mantén W para despegar...".
- Pendiente para fases siguientes: cintas/escalera/NEXT (4), MIRAR/HEAD FREE (5), objetivos 3D, MFD y MASTER CAUTION (6),
  menú y radar en móvil (7: el prototipo los oculta por debajo de 760/500 px).

## Arquitectura añadida (fase 4)

- Medidas con rayos desde `cam_pilot` (y = 1.243; ojo: 10.7 cm más bajo que los 1.35 del modelo original):
  arco del parabrisas (`Object_8`) de +2° a +9.5° a 0.74 m; combinador de +0.75° a −9.25° (±7.6° de ancho) a 0.74 m;
  soportes del HUD (`Object_11`, opacos) en |az| 6.5–7.5° a 0.70–0.85 m; antepecho bajo −9.25° (centro) / −14.5° (lados).
  La línea de mira (0°) queda justo bajo el arco.
- `src/hud/combiner/projection.ts` (+ tests): cuaternión de actitud (mismo Euler que Aircraft.tsx), `worldDir`, `toBody`,
  proyección gnomónica (`gnomonic`, `projectWorld`) y `boundsFromPoints`. 32 tests en total.
- `CombinerHud.tsx`: el propio `hud_combiner` (material clonado) escribe stencil = 1 donde pasa la profundidad; un plano a
  1000 m (hijo del avión, perpendicular a la nariz) con CanvasTexture, `depthTest:false`, mezcla aditiva y stencil EQUAL.
  `gl.stencil = true` en el Canvas (three lo desactiva por defecto desde r163). **Fase 7: EffectComposer con stencilBuffer.**
  El canvas mide lo que ocupa el vidrio en pantalla × dpr (máx. 2048) y se redibuja/sube cada fotograma. Visible si enter > 0.9.
- Escala: `COMBINER_SCALE = 2` (alrededor del centro del vidrio) y `COMBINER_PUSH = 1.8` (escala alrededor del OJO: mismo ángulo,
  más lejos, para que el arco y los soportes lo tapen). En dev: `/?hud=1.6&push=1.5`. Con escala 1 el HUD mide ~200 px en 1080p.
- `draw.ts`: conformes (escalera con peldaños orientados proyectando dos puntos, horizonte, FPM a γ, nariz en (0,0), NEXT) y no
  conformes colocados en grados (`LAYOUT`): rumbo abajo-centro (±20°), cintas en ±9°, Mach/G y waypoint por fuera de los
  soportes en −9.6°; todo recortado por debajo de +2° (arco). Sin cajas negras: un combinador sólo suma luz.
  Si se cambia mucho la escala o se reexporta la cabina, revisar `LAYOUT`.

## Arquitectura añadida (fase 5)

- Estados: exterior → cockpit ⇄ free (F; Esc) y cockpit → focus (clic en el MFD; Esc, clic fuera o botón VOLVER).
  `applyProgress` fuerza exterior si enter < 0.999 desde cualquier modo.
- `src/input/look.ts`: toggleFree/release/enterFocus; ratón = posición absoluta → yaw ±75°, pitch ±35° (como el prototipo,
  sin pointer lock para poder pulsar el HUD); táctil = arrastre relativo (160° por ancho de ventana) con `body.looking`
  (touch-action: none). Lo inicia `initKeyboard`.
- `CameraRig.tsx`: cabeza articulada en el cuello (ojos 8 cm arriba y 9 cm delante del cuello) + inclinación lateral 7 cm
  → paralaje en la cabina, ninguno en el HUD (1000 m). Suavizado λ = 7 (`rig.look`). Focus: `rig.focus` con damp λ = 4.5,
  posición lineal + slerp; distancia para que el MFD ocupe el 75 % de la vista (en vertical manda el ancho).
  Raycast propio contra `mfd_main` en `click` (no pointerup: un arrastre no cuenta) y cursor de mano encima.
- Overlay: HEAD FREE, botón MIRAR (≤ 760 px), VOLVER · ESC en focus; en focus se ocultan estado, radar, menú y ayuda.
- Idea del autor para después de la fase 7: modo de vuelo con control manual del avión (alabeo/cabeceo a gusto).

## Arquitectura añadida (fase 6)

- `src/input/picking.ts`: registro de objetos pulsables (`addPickable`) con un único raycast por movimiento/clic contra
  ellos (MFD + 4 sprites). Lo conecta `<Picking/>` en Experience. Clic sin impacto estando en focus → `release()`.
  (Sustituye al raycast del MFD que había en CameraRig.)
- `src/hud/mfd/drawMfd.ts`: canvas 1024² con OSB (izq.: secciones; der.: PRV, NXT, DCL, D/N, CAUT), contenido por sección
  (port de renderScreen), scanlines y aparición en 4 escalones; devuelve las zonas pulsables. `Mfd.tsx`: material
  MeshBasic sin tone mapping; redibuja sólo al cambiar algo (rAF bajo demanda); UV → canvas = (u·1024, v·1024) gracias a
  flipY = false. Fuera de focus el clic acerca la cámara; en focus pulsa. ← → = PRV/NXT en focus. Enlaces con window.open.
  PRV/NXT recorren proyectos en TGTS y secciones en el resto.
- `src/scene/Targets.tsx`: sprites con recuadro + rótulo (canvas 320×96, redibujado sólo si cambia distancia/estado),
  dirección real sobre una esfera de 900 m, 2.6° (2.0° fijado, rojo). Visibles cerca de PROJ (±0.85 tramos), |az| < 75°,
  sólo en cockpit/free. Hover → lockId + radio AWACS; clic → selProject + vuela a PROJ.
- Store: `selProject`, `lockId`, `declutter` (DCL: el HUD omite la escalera), `theme` ('night' | 'dawn'); `rig.dawn` lo
  suaviza Sky.tsx (cúpula, bruma, estrellas al 35 %) y lo usa GroundLights (brillo × 0.55).
- Se eliminó la textura provisional del MFD de cockpit.ts.

## Arquitectura añadida (fase 7)

- `src/scene/Effects.tsx`: EffectComposer (stencilBuffer, HalfFloat, MSAA 4 / 0 en calidad baja) con Bloom (mipmapBlur,
  umbral 1) → ToneMapping ACES → Noise (grano; opacidad 0 con reduced motion). El composer pone el tone mapping del
  renderer a None mientras está activo, por eso ACES va como efecto. Pantallas emisoras con `EMISSIVE_GAIN` = 1.7
  (HUD, objetivos; MFD × 0.7) y luna × 3, todas con toneMapped por defecto (iguales con y sin composer).
  Dev: `/?fx=0` quita el post-procesado; `/?debug` expone `window.__gl` (17 draw calls, 23k triángulos sin fx).
- `Quality` (Experience): PerformanceMonitor → store.quality 'high'/'low' (dpr 1, sin MSAA, HUD a 30 Hz).
  Canvas sin antialias nativo cuando hay composer; `role="img"` + aria-label.
- `src/scene/fov.ts`: `cockpitFov(aspecto)` = máx(62°, el que da ≥ 36° horizontales); lo usan CameraRig, el focus y el
  canvas del HUD.
- `MobileNav` (≤ 760 px): ◀ sección ▶ con botones de 44 px.
- Créditos estructurados (`CONTENT.credits` = {text, href}): MFD (enlaces pulsables) y texto accesible; `CREDITS.md`
  final con auditoría de licencias de producción (todas MIT/Apache/ISC/Zlib/GSAP; Apache opcionales no entran al bundle).
- Bundle: chunks three (187 KB gzip), r3f (105), react (64), motion (49), app (22). `chunkSizeWarningLimit` 800.
  Pantalla de arranque estática en index.html (dentro de #root; React la reemplaza) y <noscript>.
- Pendiente de medir en dispositivo real: fps en móvil de gama media (SwiftShader no sirve para eso).

## Fase 8 (extra): vuelo manual y piloto automático

- Decisiones del autor (2026-10-16): esquema **Expert** de Ace Combat (A/D tasa de alabeo, W/S factor de carga; loops y
  toneles), **W = nariz abajo**, **Shift** frena (Ctrl descartado: Ctrl+W cierra la pestaña), Space acelera, y al reconectar
  el autopiloto el avión **vuela de vuelta** a la ruta (no fundido).
- `src/flight/manual.ts` (+ 10 tests, 42 en total): masa puntual con actitud en cuaternión; ω = (f̂ × a⊥)/v con a = g·n·û + g;
  n neutro = cos γ; v̇ = empuje − arrastre − g·sen γ (crucero 220 m/s, máx. ≈ 285); n ∈ [−3, 9]; alabeo hasta 150°/s;
  Auto-GCAS; `projectOnRoute`, `waypointNear`, `returnGuidance` (persecución pura a 3 km, P en cascada).
- `src/flight/autopilot.ts`: modos 'auto' | 'manual' | 'return' (store.pilot). Transiciones fuera de useFrame; vigilante a 10 Hz
  (traspaso cuando `rig.returnDone`, captura de waypoints a < 2.5 km, área de 12 km con 10 s de gracia, avisos GCAS/área).
  Traspaso sin saltos: `FlightState.hOff/altOff` decaen (λ 0.8) y `resumeRoute` coloca el scroll y planea al siguiente waypoint
  (o vuela a la sección pedida con el menú). WASD durante el regreso = retomar el mando. Manual sólo con `(pointer: fine)`.
- `FlightState`: `navX/navZ` (posición de navegación; radar, NEXT y objetivos la usan), `n` (G del HUD).
- Scroll bloqueado en manual (`lockScroll`: lenis.stop / overflow). Aircraft.tsx elige integrador según el modo.
- Controles: tecla P, rótulo A/P|MAN|RTN en el MFD (derecha abajo; OSB de la derecha reespaciados a 140 px) y pulsador 3D
  `AutopilotButton` sobre el antepecho izquierdo (posición medida con un rayo: (0.2567, 0.941, 6.4252), normal (0, .259, −.966)).
  HUD: modo bajo G y "PULL UP" con Auto-GCAS. Overlay: `PilotTag` y ayuda de teclas del vuelo manual.
- Panel: `optimize-glb.mjs` exporta además `public/textures/panel_front.webp` (1024 px, q88, ~120 KB) y `HiResPanel` la carga al
  entrar a la cabina (mipmaps + anisotropía 8). El GLB sigue a 512 px.
- Corregido: al redimensionar la ventana el avión cambiaba de waypoint (la pista mide en vh); ahora se guarda el progreso en
  'refreshInit' y se restaura en 'refresh' de ScrollTrigger.
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

- Marco del canopy muy azul de noche (luna a través del cristal): se puede oscurecer en `Sky.tsx` (`lerp(1.6, 0.3, k)`).
- Fuentes B612 vía Google Fonts (enlace en `index.html`); OFL permite autoalojarlas si se quiere funcionar sin conexión.
