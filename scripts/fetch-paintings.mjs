/* global Buffer, console, setTimeout, fetch */
// Descarga las imágenes de src/data/masterpieces.json desde Wikimedia Commons (solo
// licencias CC0 o dominio público), verifica la licencia, los redimensiona con sharp y escribe los créditos.
// Se ejecuta en GitHub Actions (workflow "Cuadros"); en local requiere red y `npm i --no-save sharp`.
//
//   node scripts/fetch-paintings.mjs
//
// Salidas: public/paintings/<id>.jpg y src/data/masterpieceCredits.json
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

// sharp se instala solo en el workflow (no es dependencia del juego).
const sharp = (await import('sharp')).default;

const UA = 'PigmentoGame/0.1 (https://github.com/daniacerpa/Juego-Pintura1; juego educativo)';
const data = JSON.parse(readFileSync('src/data/masterpieces.json', 'utf8'));
const outDir = 'public/paintings';
mkdirSync(outDir, { recursive: true });

// Créditos previos: lo ya descargado con la misma búsqueda no se vuelve a pedir.
let previous = {};
try {
  previous = JSON.parse(readFileSync('src/data/masterpieceCredits.json', 'utf8'));
} catch {
  previous = {};
}
const credits = {};
const failures = [];
const API = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Llamada a la API con pausa y reintentos (Wikimedia limita la frecuencia). */
async function api(params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(700 + attempt * 2500);
    const res = await fetch(`${API}&${params}`, { headers: { 'User-Agent': UA } });
    const text = await res.text();
    if (res.ok && text.trimStart().startsWith('{')) return JSON.parse(text);
  }
  throw new Error('la API de Wikimedia no respondió (límite de frecuencia)');
}

/** Descarga con reintentos. */
async function download(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(500 + attempt * 2500);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }
  throw new Error(`no se pudo descargar ${url}`);
}

/** Archivos candidatos: el nombre exacto (`file`) o los resultados de búsqueda (`search`). */
async function candidates(p) {
  if (p.file) return [`File:${p.file}`];
  const json = await api(
    `list=search&srnamespace=6&srlimit=40&srsearch=${encodeURIComponent(p.search + ' filetype:bitmap')}`,
  );
  return (json.query?.search ?? []).map((r) => r.title);
}

/**
 * Colorido de una miniatura (métrica de Hasler y Süsstrunk), penalizando imágenes oscuras
 * o lavadas: así, entre varios candidatos válidos se queda la imagen más vistosa.
 */
async function vividness(url) {
  const buf = await download(url).catch(() => null);
  if (!buf) return 0;
  const { data, info } = await sharp(buf)
    .resize(160, 160, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let srg = 0,
    syb = 0,
    srg2 = 0,
    syb2 = 0,
    sl = 0;
  const n = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    srg += rg;
    syb += yb;
    srg2 += rg * rg;
    syb2 += yb * yb;
    sl += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const mrg = srg / n,
    myb = syb / n;
  const sdrg = Math.sqrt(Math.max(0, srg2 / n - mrg * mrg));
  const sdyb = Math.sqrt(Math.max(0, syb2 / n - myb * myb));
  const colorful = Math.sqrt(sdrg ** 2 + sdyb ** 2) + 0.3 * Math.sqrt(mrg ** 2 + myb ** 2);
  const light = sl / n;
  const lightFactor = light < 60 ? 0.4 : light < 95 ? 0.75 : light > 225 ? 0.7 : 1;
  return colorful * lightFactor;
}

/** Entre los candidatos con licencia libre, imagen grande y proporción razonable, el más vistoso. */
async function pick(p) {
  const reasons = [];
  const valid = [];
  for (const title of await candidates(p)) {
    if (valid.length >= 6) break;
    if (
      /detail|detalle|crop|frame|marco|google art project|painting|nara|nasa|cira|\.(pdf|tif|tiff|svg|djvu|webm|ogv)$/i.test(
        title,
      )
    )
      continue;
    const json = await api(
      `prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1400&titles=${encodeURIComponent(title)}`,
    );
    const info = json.query?.pages?.[0]?.imageinfo?.[0];
    if (!info) continue;
    const license = String(info.extmetadata?.LicenseShortName?.value ?? '');
    const aspect = info.width / info.height;
    if (!/public domain|^pd|dominio p|cc0|cc-zero/i.test(license)) {
      reasons.push(`${title}: licencia "${license}"`);
      continue;
    }
    if (!/jpe?g|png/.test(info.mime) || info.width < 1200 || aspect < 0.55 || aspect > 2.1) {
      reasons.push(`${title}: ${info.mime} ${info.width}x${info.height}`);
      continue;
    }
    valid.push({ title, info, license });
  }
  if (valid.length === 0)
    throw new Error(`sin candidato válido (${reasons.slice(0, 3).join('; ') || 'sin resultados'})`);
  if (p.file || valid.length === 1) return valid[0];
  let best = valid[0];
  let bestScore = -1;
  for (const v of valid) {
    const score = await vividness(v.info.thumburl ?? v.info.url);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

for (const p of data.paintings) {
  const out = join(outDir, `${p.id}.jpg`);
  const query = p.file ?? p.search;
  const prev = previous[p.id];
  if (prev && prev.query === query && existsSync(out)) {
    credits[p.id] = prev;
    console.log(`=   ${p.id}  (sin cambios)`);
    continue;
  }
  try {
    const { title, info, license } = await pick(p);
    const buf = await download(info.thumburl ?? info.url);
    const max = data.displayMaxPx;
    const info2 = await sharp(buf)
      .rotate()
      .toColorspace('srgb')
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toFile(out);
    const strip = (v) =>
      String(v ?? '')
        .replace(/<[^>]+>/g, '')
        .trim();
    credits[p.id] = {
      query,
      author: strip(info.extmetadata?.Artist?.value).slice(0, 80),
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
    // Si falla, se conserva lo que había (si la imagen sigue en disco).
    if (prev && existsSync(out)) credits[p.id] = prev;
  }
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
