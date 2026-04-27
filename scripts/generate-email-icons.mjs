#!/usr/bin/env node
/**
 * Generates 40×40 PNG icons (2× retina for 20px display) used inside the
 * customer estimate email. Cross-client email parity requires PNGs, since
 * Gmail and Outlook desktop both strip inline <svg>. Output is committed to
 * public/email/icons/ and referenced by absolute URL from emailTemplates.ts.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'email', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

// Color tokens — must match emailTemplates.ts
const RED = '#DC2626';
const GREEN = '#16A34A';
const ORANGE = '#ea580c';

// Icon path data (24×24 viewBox). Stroked icons rely on stroke + non-fill.
const STROKE = {
  phoneOff:
    '<path d="M22 16.92v3.08A2 2 0 0 1 19.92 22 19 19 0 0 1 2 4.08 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.91.71 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.58 2.81.71A2 2 0 0 1 22 16.92z"/><line x1="2" y1="2" x2="22" y2="22"/>',
  fileX:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9.5" y1="13.5" x2="14.5" y2="18.5"/><line x1="14.5" y1="13.5" x2="9.5" y2="18.5"/>',
  shieldAlert:
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  droplet:
    '<path d="M12 2.69 5.34 9.34a8 8 0 1 0 13.32 0z"/><line x1="3" y1="3" x2="21" y2="21"/>',
  shieldCheck:
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
  wrench:
    '<path d="M14.7 6.3a4 4 0 0 0 5 5l-3 3 4 4a2 2 0 1 1-3 3l-4-4-3 3a4 4 0 0 1-5-5l3-3-4-4a2 2 0 1 1 3-3l4 4z"/>',
  smartphone:
    '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  camera:
    '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  badgeCheck:
    '<circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>',
  fileCheck:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>',
  fileText:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  circleCheck:
    '<circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>',
};

// Per-icon stroke color. Icons live in semantic color blocks.
const COLOR = {
  phoneOff: RED, fileX: RED, shieldAlert: RED, droplet: RED,
  shieldCheck: GREEN, wrench: GREEN, smartphone: GREEN, camera: GREEN, badgeCheck: GREEN, fileCheck: GREEN,
  fileText: ORANGE, circleCheck: ORANGE,
};

const SIZE = 40; // 2× retina for 20px display

function strokedSvg(paths, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// Filled circle with white digit, used for the 1/2/3 step bullets.
function numberSvg(num, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="${color}"><circle cx="12" cy="12" r="11"/><text x="12" y="16.5" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" text-anchor="middle" fill="#ffffff">${num}</text></svg>`;
}

async function writePng(name, svg) {
  const buf = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT_DIR, `${name}.png`), buf);
  // eslint-disable-next-line no-console
  console.log(`  ${name}.png  (${buf.length} bytes)`);
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`Writing icons to ${OUT_DIR}`);
  for (const [name, paths] of Object.entries(STROKE)) {
    await writePng(name, strokedSvg(paths, COLOR[name]));
  }
  for (const n of [1, 2, 3, 4]) {
    await writePng(`step-${n}`, numberSvg(n, ORANGE));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
