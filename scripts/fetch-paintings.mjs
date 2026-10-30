/* global Buffer, console, setTimeout, fetch */
// Descarga los cuadros de dominio público de src/data/masterpieces.json desde Wikimedia
// Commons, verifica la licencia, los redimensiona con sharp y escribe los créditos.
// Se ejecuta en GitHub Actions (workflow "Cuadros"); en local requiere red y `npm i --no-save sharp`.
//
//   node scripts/fetch-paintings.mjs
//
// Salidas: public/paintings/<id>.jpg y src/data/masterpieceCredits.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// sharp se instala solo en el workflow (no es dependencia del juego).
const sharp = (await import('sharp')).default;

const UA = 'PigmentoGame/0.1 (https://github.com/daniacerpa/Juego-Pintura1; juego educativo)';
const data = JSON.parse(readFileSync('src/data/masterpieces.json', 'utf8'));
const outDir = 'public/paintings';
mkdirSync(outDir, { recursive: true });

const credits = {};
const failures = [];
for (const p of data.paintings) {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    '&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1400&titles=' +
    encodeURIComponent(`File:${p.file}`);
  try {
    const res = await fetch(api, { headers: { 'User-Agent': UA } });
    const json = await res.json();
    const page = json.query?.pages?.[0];
    const info = page?.imageinfo?.[0];
    if (!info) throw new Error(`no existe en Commons (${page?.missing ? 'missing' : 'sin info'})`);
    const meta = info.extmetadata ?? {};
    const license = String(meta.LicenseShortName?.value ?? '');
    if (!/public domain|^pd|dominio p/i.test(license))
      throw new Error(`licencia no es dominio público: "${license}"`);
    const url = info.thumburl ?? info.url;
    const img = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!img.ok) throw new Error(`descarga ${img.status}`);
    const out = join(outDir, `${p.id}.jpg`);
    const max = data.displayMaxPx;
    const buf = Buffer.from(await img.arrayBuffer());
    const info2 = await sharp(buf)
      .rotate()
      .toColorspace('srgb')
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toFile(out);
    const dims = [info2.width, info2.height];
    credits[p.id] = {
      width: Number(dims[0]),
      height: Number(dims[1]),
      license,
      source: info.descriptionurl,
    };
    console.log(`OK  ${p.id}  ${dims.join('x')}  ${license}`);
  } catch (e) {
    failures.push(`${p.id}: ${e.message}`);
    console.log(`ERR ${p.id}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 400)); // cortesía con la API
}

writeFileSync('src/data/masterpieceCredits.json', JSON.stringify(credits, null, 2) + '\n');
// Reporte legible versionado junto a las imágenes (los logs de Actions no siempre son accesibles).
const report = [
  `Cuadros descargados: ${Object.keys(credits).length} de ${data.paintings.length}`,
  ...Object.entries(credits).map(([id, c]) => `OK  ${id}  ${c.width}x${c.height}  ${c.license}`),
  ...failures.map((f) => `ERR ${f}`),
].join('\n');
writeFileSync(join(outDir, 'REPORTE.txt'), report + '\n');
console.log('\n' + report);
