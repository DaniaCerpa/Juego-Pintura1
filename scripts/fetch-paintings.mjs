// Descarga los cuadros de dominio público de src/data/masterpieces.json desde Wikimedia
// Commons, verifica la licencia, los redimensiona con ImageMagick y escribe los créditos.
// Se ejecuta en GitHub Actions (workflow "Cuadros"); en local requiere red y `convert`.
//
//   node scripts/fetch-paintings.mjs
//
// Salidas: public/paintings/<id>.jpg y src/data/masterpieceCredits.json
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    const tmp = join(tmpdir(), `${p.id}.src`);
    writeFileSync(tmp, Buffer.from(await img.arrayBuffer()));
    const out = join(outDir, `${p.id}.jpg`);
    const max = data.displayMaxPx;
    execFileSync('convert', [
      tmp,
      '-auto-orient',
      '-colorspace',
      'sRGB',
      '-resize',
      `${max}x${max}>`,
      '-strip',
      '-interlace',
      'Plane',
      '-quality',
      '82',
      out,
    ]);
    const dims = execFileSync('identify', ['-format', '%w %h', out]).toString().trim().split(' ');
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
if (failures.length) console.log(`\n${failures.length} con error:\n- ${failures.join('\n- ')}`);
if (!existsSync(outDir) || Object.keys(credits).length === 0) process.exit(1);
