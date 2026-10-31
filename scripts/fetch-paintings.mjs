/* global Buffer, console, setTimeout, fetch */
// Descarga los cuadros de dominio público de src/data/masterpieces.json desde Wikimedia
// Commons, verifica la licencia, los redimensiona con sharp y escribe los créditos.
// Se ejecuta en GitHub Actions (workflow "Cuadros"); en local requiere red y `npm i --no-save sharp`.
//
//   node scripts/fetch-paintings.mjs
//
// Salidas: public/paintings/<id>.jpg y src/data/masterpieceCredits.json
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// sharp se instala solo en el workflow (no es dependencia del juego).
const sharp = (await import('sharp')).default;

const UA = 'PigmentoGame/0.1 (https://github.com/daniacerpa/Juego-Pintura1; juego educativo)';
const data = JSON.parse(readFileSync('src/data/masterpieces.json', 'utf8'));
const outDir = 'public/paintings';
mkdirSync(outDir, { recursive: true });

const credits = {};
const failures = [];
const API = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2';

async function api(params) {
  const res = await fetch(`${API}&${params}`, { headers: { 'User-Agent': UA } });
  return res.json();
}

/** Archivos candidatos: el nombre exacto (`file`) o los resultados de búsqueda (`search`). */
async function candidates(p) {
  if (p.file) return [`File:${p.file}`];
  const json = await api(
    `list=search&srnamespace=6&srlimit=10&srsearch=${encodeURIComponent(p.search)}`,
  );
  return (json.query?.search ?? []).map((r) => r.title);
}

/** Primer candidato con licencia de dominio público, imagen grande y proporción razonable. */
async function pick(p) {
  const reasons = [];
  for (const title of await candidates(p)) {
    if (/detail|detalle|crop|frame|marco|\.(pdf|tif|tiff|svg|djvu|webm|ogv)$/i.test(title))
      continue;
    const json = await api(
      `prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1400&titles=${encodeURIComponent(title)}`,
    );
    const info = json.query?.pages?.[0]?.imageinfo?.[0];
    if (!info) continue;
    const license = String(info.extmetadata?.LicenseShortName?.value ?? '');
    const aspect = info.width / info.height;
    if (!/public domain|^pd|dominio p/i.test(license)) {
      reasons.push(`${title}: licencia "${license}"`);
      continue;
    }
    if (!/jpe?g|png/.test(info.mime) || info.width < 900 || aspect < 0.55 || aspect > 2.1) {
      reasons.push(`${title}: ${info.mime} ${info.width}x${info.height}`);
      continue;
    }
    return { title, info, license };
  }
  throw new Error(`sin candidato válido (${reasons.slice(0, 3).join('; ') || 'sin resultados'})`);
}

for (const p of data.paintings) {
  try {
    const { title, info, license } = await pick(p);
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
    credits[p.id] = {
      width: info2.width,
      height: info2.height,
      license,
      file: title.replace(/^File:/, ''),
      source: info.descriptionurl,
    };
    console.log(`OK  ${p.id}  ${info2.width}x${info2.height}  ${license}  ${title}`);
  } catch (e) {
    failures.push(`${p.id}: ${e.message}`);
    console.log(`ERR ${p.id}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 400)); // cortesía con la API
}

// Quitar imágenes de obras que ya no están en la lista.
const keep = new Set(data.paintings.map((p) => `${p.id}.jpg`));
for (const f of readdirSync(outDir))
  if (f.endsWith('.jpg') && !keep.has(f)) unlinkSync(join(outDir, f));

writeFileSync('src/data/masterpieceCredits.json', JSON.stringify(credits, null, 2) + '\n');
// Reporte legible versionado junto a las imágenes (los logs de Actions no siempre son accesibles).
const report = [
  `Cuadros descargados: ${Object.keys(credits).length} de ${data.paintings.length}`,
  ...Object.entries(credits).map(
    ([id, c]) => `OK  ${id}  ${c.width}x${c.height}  ${c.license}  ${c.file}`,
  ),
  ...failures.map((f) => `ERR ${f}`),
].join('\n');
writeFileSync(join(outDir, 'REPORTE.txt'), report + '\n');
console.log('\n' + report);
