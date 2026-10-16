# Créditos y licencias

Proyecto personal sin fines comerciales de J. A. Cárdenas ("Alejo"). Los mismos créditos se muestran
en el sitio, en la sección **CRED** (pantalla MFD de la cabina, con enlaces) y en el texto accesible
de la página.

## Modelo 3D

- **"Su-30 MKI loadout#1 [Brahmos]"** por **abhinab.das000**
- Fuente: <https://sketchfab.com/3d-models/su-30-mki-loadout1-brahmos-e9b810ba081544d0997ad8cce4b95fc8>
- Licencia: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Cambios: editado en Blender (cabina con paneles `panel_front`/`panel_rear`, vidrio `canopy_glass`,
  combinador `hud_combiner`, pantalla `mfd_main` y marcadores `cam_pilot`/`hud_anchor`), exportado a GLB y
  optimizado para la web (Meshopt, texturas WebP a 512 px). Los créditos también van dentro del archivo
  (`asset.extras` del GLB).

## Sonidos

Recortados, normalizados y convertidos en bucle con `npm run sounds` (`tools/process-sounds.mjs`).
Los originales no están en el repositorio.

- **"Jet engine startup"**, SamsterBirdies (Freesound 491407):
  <https://freesound.org/people/samsterbirdies/sounds/491407/>, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
  Se usa el tramo del encendido (16.8–20.3 s).
- **"Commercial aircraft in flight sounds"** (Pixabay, ID 17309) y **"Jet engine"** (Pixabay, ID 6753), del usuario
  "freesound_community", con la [Pixabay Content License](https://pixabay.com/service/license-summary/): uso libre sin
  atribución obligatoria; prohíbe redistribuir los archivos tal cual, por eso sólo se publican versiones editadas dentro
  del sitio. Licencia aceptada por el autor del proyecto el 2026-10-15.

## Tipografía

- **B612** y **B612 Mono** (Airbus, con Intactile Design, ENAC y Universidad de Toulouse III),
  [SIL Open Font License 1.1](https://openfontlicense.org/), <https://github.com/polarsys/b612>.
  Se sirven desde Google Fonts.

## Librerías incluidas en el sitio publicado

| Librería | Licencia |
| --- | --- |
| three | MIT |
| react, react-dom, scheduler | MIT |
| @react-three/fiber, @react-three/drei, @react-three/postprocessing | MIT |
| three-stdlib, meshoptimizer (decodificador), its-fine, suspend-react, zustand, lenis | MIT |
| postprocessing | Zlib |
| n8ao (incluido por @react-three/postprocessing) | ISC |
| GSAP 3 con ScrollTrigger | [GSAP Standard "no charge" License](https://gsap.com/standard-license) |

Auditoría del 2026-10-16 con `npm ls --omit=dev --all`: las 63 dependencias de producción son MIT (48),
Apache-2.0 (5), ISC (4), Zlib (1) o GSAP Standard (1); las Apache-2.0 (mediapipe, hls.js, rapier, draco3d,
promise-worker-transferable) son opcionales de drei y no entran en el bundle.

## Herramientas de desarrollo (no se distribuyen)

| Herramienta | Licencia |
| --- | --- |
| vite, vitest, @vitejs/plugin-react, typescript | MIT / Apache-2.0 (TypeScript) |
| @gltf-transform/* | MIT y BlueOak-1.0.0 |
| meshoptimizer (codificador) | MIT |
| sharp (binario libvips) | Apache-2.0 y LGPL-3.0-or-later |
| lightningcss (dentro de Vite) | MPL-2.0 |
| ffmpeg (procesado de sonidos) | LGPL-2.1+ / GPL según la compilación |

Las licencias MPL-2.0, LGPL, GPL y BlueOak-1.0.0 sólo aparecen en herramientas de compilación; ninguna
llega al código ni a los assets que se publican. Aceptadas por el autor el 2026-10-15.

## Inspiración

Interfaz inspirada en la saga **Ace Combat** (Bandai Namco). Este proyecto no usa assets, logotipos ni
tipografías de Ace Combat: la simbología está dibujada con código propio. No está afiliado ni respaldado
por Bandai Namco.
