/**
 * Generador pseudoaleatorio con semilla (mulberry32): devuelve números en [0, 1) y, con la misma
 * semilla, siempre la misma secuencia. Así las estrellas y las ciudades salen iguales en cada
 * carga. Math.random() no admite semilla.
 */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
