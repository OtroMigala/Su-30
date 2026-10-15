import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Las funciones de flight/route.ts son matemática pura (sin DOM ni WebGL),
  // así que los tests corren en Node, sin jsdom.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true, // fase 0: aún no hay tests; los de route.ts llegan en la fase 2
  },
});
