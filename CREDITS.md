# Créditos y licencias

Proyecto personal sin fines comerciales. Borrador de la fase 0; se completa en la fase 7
con las versiones definitivas de las librerías y se refleja también en la página de créditos del sitio.

## Modelo 3D

- **Su-30 MKI loadout#1 [Brahmos]** por abhinab.das000
- Fuente: <https://sketchfab.com/3d-models/su-30-mki-loadout1-brahmos-e9b810ba081544d0997ad8cce4b95fc8>
- Licencia: [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/)
- Cambios: modelo editado en Blender (cabina con paneles `panel_front`/`panel_rear`, vidrio `canopy_glass`,
  combinador `hud_combiner`, pantalla `mfd_main` y marcadores `cam_pilot`/`hud_anchor`), exportado de nuevo a GLB
  y optimizado para la web.

## Sonidos

Recortados, normalizados y convertidos en bucle con `npm run sounds` (`tools/process-sounds.mjs`).
Los originales no están en el repositorio.

- **Jet engine startup**, SamsterBirdies (Freesound 491407): <https://freesound.org/people/samsterbirdies/sounds/491407/>,
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Se usa el tramo del encendido (16.8–20.3 s).
- **Commercial aircraft in flight sounds** (Pixabay, ID 17309) y **Jet engine** (Pixabay, ID 6753), del usuario
  "freesound_community", con la [Pixabay Content License](https://pixabay.com/service/license-summary/): uso libre sin atribución
  obligatoria; prohíbe redistribuir los archivos tal cual, por eso sólo se publican versiones editadas dentro del sitio.
  Licencia aceptada por el autor del proyecto el 2026-10-15.

## Tipografía

- **B612** y **B612 Mono** (Airbus / Polytechnique / ENAC), licencia [SIL Open Font License 1.1](https://openfontlicense.org/), servidas desde Google Fonts.

## Librerías

| Librería | Licencia |
| --- | --- |
| three, @react-three/fiber, @react-three/drei, @react-three/postprocessing | MIT |
| postprocessing | Zlib |
| react, react-dom, zustand, lenis | MIT |
| GSAP (con ScrollTrigger) | [GSAP Standard "no charge" License](https://gsap.com/standard-license) |
| vite, vitest, @gltf-transform/*, meshoptimizer (herramientas de desarrollo, no se distribuyen) | MIT |
| sharp (desarrollo): binario libvips | Apache-2.0 y LGPL-3.0-or-later |
| lightningcss (desarrollo, dentro de Vite) | MPL-2.0 |
| ffmpeg (desarrollo, procesado de sonidos; no se distribuye) | LGPL-2.1+ / GPL según la compilación |

Las licencias MPL-2.0, LGPL, GPL (ffmpeg) y BlueOak-1.0.0 sólo aparecen en herramientas de compilación
(Vite, sharp, gltf-transform, ffmpeg); ninguna llega al código ni a los assets que se publican. Aceptadas por el autor el 2026-10-15.

## Inspiración

Interfaz inspirada en la saga Ace Combat (Bandai Namco). Este proyecto no usa assets, logotipos ni
tipografías de Ace Combat: la simbología está dibujada con código propio. No está afiliado ni respaldado por Bandai Namco.
