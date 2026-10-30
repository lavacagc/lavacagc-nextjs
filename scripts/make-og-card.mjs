#!/usr/bin/env node
/**
 * Builds public/og-card.png, the 1200x630 share card every page advertises as
 * its og:image (see src/lib/seo/ogCard.ts). Run: node scripts/make-og-card.mjs
 *
 * The logo is public/logo.png composited as is, only resampled with lanczos;
 * it is never redrawn. The text is SVG rendered by sharp's librsvg, which
 * resolves the site's sans font (Inter) through fontconfig, so Inter must be
 * installed where this runs. The script refuses to write the card otherwise,
 * because librsvg would silently fall back to another face.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(ROOT, 'public/logo.png');
const OUT = path.join(ROOT, 'public/og-card.png');

const WIDTH = 1200;
const HEIGHT = 630;
const NAVY = '#002855';
const ORANGE = '#EE9639';
const LOGO_SIZE = 240;
const FONT = 'Inter';

function assertFontInstalled() {
  let match = '';
  try {
    match = execFileSync('fc-match', ['-f', '%{family}', FONT], { encoding: 'utf8' });
  } catch {
    throw new Error('fc-match not found: cannot confirm the Inter font is installed.');
  }
  if (!match.split(',').includes(FONT)) {
    throw new Error(`Font "${FONT}" is not installed (fontconfig resolves it to "${match}").`);
  }
}

async function main() {
  assertFontInstalled();

  const logo = await sharp(LOGO)
    .resize(LOGO_SIZE, LOGO_SIZE, { kernel: sharp.kernel.lanczos3, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const logoLeft = 120;
  const logoTop = Math.round((HEIGHT - LOGO_SIZE) / 2);
  const textLeft = logoLeft + LOGO_SIZE + 64;

  const text = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <style>
        .name { font-family: ${FONT}; font-weight: 700; font-size: 56px; fill: #FFFFFF; }
        .line { font-family: ${FONT}; font-weight: 500; font-size: 34px; fill: #FFFFFF; }
      </style>
      <text class="name" x="${textLeft}" y="${HEIGHT / 2 - 34}">La Vaca</text>
      <text class="name" x="${textLeft}" y="${HEIGHT / 2 + 30}">General Contractors</text>
      <rect x="${textLeft}" y="${HEIGHT / 2 + 62}" width="96" height="6" rx="3" fill="${ORANGE}" />
      <text class="line" x="${textLeft}" y="${HEIGHT / 2 + 122}">Northern New Jersey remodeling</text>
    </svg>`;

  await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: NAVY } })
    .composite([
      { input: logo, left: logoLeft, top: logoTop },
      { input: Buffer.from(text), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(OUT);

  const meta = await sharp(OUT).metadata();
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${meta.width}x${meta.height})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
