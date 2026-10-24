// PRNG sembrado (mulberry32). Determinista: misma semilla → misma secuencia en todo dispositivo.
export interface Rng {
  /** Flotante en [0, 1). */
  next(): number;
  /** Entero en [min, max] (ambos inclusive). */
  int(min: number, max: number): number;
  /** Elemento aleatorio del arreglo. */
  pick<T>(items: readonly T[]): T;
  /** Baraja en sitio (Fisher-Yates) y devuelve el mismo arreglo. */
  shuffle<T>(items: T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
      }
      return items;
    },
  };
}
