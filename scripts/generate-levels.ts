// Regenera src/data/levels/levels_0001_0500.json con el generador determinista (§4.2).
// Uso: npm run levels [-- --from 1 --to 500]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLevel } from '../src/core/generator';
import handmade from '../src/data/levels/handmade.json';
import type { LevelDef } from '../src/core/types';

const args = process.argv.slice(2);
const arg = (name: string, def: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const from = arg('from', 1);
const to = arg('to', 500);

const handmadeIds = new Set((handmade as { levels: LevelDef[] }).levels.map((l) => l.id));
const levels: LevelDef[] = [];
const warnings: string[] = [];
const started = Date.now();

for (let n = from; n <= to; n++) {
  if (handmadeIds.has(n)) continue; // prioridad de handmade.json (§4.4)
  const t = Date.now();
  const g = generateLevel(n);
  levels.push(g.def);
  warnings.push(...g.warnings);
  if (n % 25 === 0 || Date.now() - t > 1500) {
    console.log(
      `nivel ${n}: par ${g.def.par}, ${g.def.jars.length} frascos, ${g.attempts} intentos, ${Date.now() - t} ms`,
    );
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/data/levels/levels_0001_0500.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), levels }, null, 0) + '\n',
);
console.log(
  `\n${levels.length} niveles escritos en ${out} en ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
if (warnings.length) {
  console.log(`\n${warnings.length} warnings:`);
  for (const w of warnings) console.log('  - ' + w);
}
