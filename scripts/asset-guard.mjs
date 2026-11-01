#!/usr/bin/env node
// Asset guard: fail when a file in public/ is over the size limit, unless it is
// a known large file listed in scripts/asset-guard-baseline.json and has not
// grown. The baseline is a ratchet: it only shrinks as files get compressed.
//
//   node scripts/asset-guard.mjs              # check (CI)
//   node scripts/asset-guard.mjs --baseline   # rewrite the baseline from disk
//
// Prints the total size of public/ and, under GitHub Actions, writes a summary.

import { statSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = 'public';
const LIMIT_BYTES = 1024 * 1024; // 1 MB
const BASELINE = 'scripts/asset-guard-baseline.json';

// Only files git tracks: an untracked local file never ships, and counting it
// made the laptop and CI disagree (164.8 MB locally, 118.8 MB in CI).
function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z', '--', ROOT], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ path, bytes: statSync(path).size }));
}

const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const files = trackedFiles();
const total = files.reduce((n, f) => n + f.bytes, 0);
const large = files.filter((f) => f.bytes > LIMIT_BYTES).sort((a, b) => b.bytes - a.bytes);

if (process.argv.includes('--baseline')) {
  const baseline = Object.fromEntries(large.map((f) => [f.path, f.bytes]));
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`asset-guard: baseline written with ${large.length} file(s) over ${mb(LIMIT_BYTES)}.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const failures = [];
for (const f of large) {
  const allowed = baseline[f.path];
  if (allowed === undefined) failures.push(`${f.path} is ${mb(f.bytes)}, over the ${mb(LIMIT_BYTES)} limit (compress it or host it on Supabase storage)`);
  else if (f.bytes > allowed) failures.push(`${f.path} grew from ${mb(allowed)} to ${mb(f.bytes)}; baselined large files may only shrink`);
}

const lines = [
  `public/ total: ${mb(total)} in ${files.length} files`,
  `files over ${mb(LIMIT_BYTES)}: ${large.length} (${Object.keys(baseline).length} baselined)`,
  ...large.slice(0, 5).map((f) => `  ${mb(f.bytes).padStart(8)}  ${f.path}`),
];
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Public assets\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
}
if (failures.length) {
  console.error(`\nasset-guard: ${failures.length} problem(s):\n` + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
