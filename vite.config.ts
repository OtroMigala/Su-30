import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Ruta base del sitio publicado. GitHub Pages sirve el repositorio "Su-30" en
  // https://otromigala.github.io/Su-30/, así que allí la base es '/Su-30/' (la pone el workflow con
  // BASE_PATH). En local, '/'. El código usa import.meta.env.BASE_URL para sus archivos de public/.
  base: process.env.BASE_PATH || '/',
  build: {
    // three.js minificado mide ~740 KB (187 KB gzip) y no se puede trocear más: se sube el umbral
    // del aviso para que sólo salte si algo crece de verdad.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // Las librerías van en archivos aparte del código propio. El total no baja, pero el
        // navegador las guarda en caché: al publicar un cambio del sitio sólo se descarga de nuevo
        // el chunk de la aplicación (unos KB), no los ~1.2 MB de three.js y compañía.
        // Con prioridad, un módulo que cumple varios `test` va al grupo de prioridad mayor.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\/]three[\/]/, priority: 40 },
            { name: 'r3f', test: /node_modules[\/](@react-three|three-stdlib|troika-|postprocessing|meshoptimizer|@monogrid|maath)/, priority: 30 },
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler|zustand|its-fine|suspend-react)[\/]/, priority: 20 },
            { name: 'motion', test: /node_modules[\/](gsap|lenis)[\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  // Las funciones de flight/route.ts y hud/combiner/projection.ts son matemática pura (sin DOM ni
  // WebGL), así que los tests corren en Node, sin jsdom.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
