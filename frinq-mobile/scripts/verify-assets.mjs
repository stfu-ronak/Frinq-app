#!/usr/bin/env node
// Verifies every font listed in src/assets/asset-manifest.json exists and its
// sha256 matches, that THIRD_PARTY_NOTICES.md is present, and that no
// confidential commercial records leaked into the manifest. Fails with a
// precise reason on drift.
//
// Usage: node scripts/verify-assets.mjs [--root <dir>]

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit, cwd } from 'node:process';

function getRoot() {
  const i = argv.indexOf('--root');
  return i !== -1 && argv[i + 1] ? argv[i + 1] : cwd();
}

// Substrings that must never appear in the manifest (confidential records).
const FORBIDDEN = [/license[_-]?key/i, /order[_-]?(id|number)/i, /receipt/i, /invoice/i, /purchase[_-]?order/i];

export function verifyAssets(root) {
  const errors = [];
  const manifestPath = join(root, 'src/assets/asset-manifest.json');

  if (!existsSync(manifestPath)) {
    return { ok: false, errors: ['missing src/assets/asset-manifest.json'] };
  }
  const raw = readFileSync(manifestPath, 'utf8');

  if (!existsSync(join(root, 'THIRD_PARTY_NOTICES.md'))) errors.push('missing THIRD_PARTY_NOTICES.md');

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return { ok: false, errors: [...errors, 'asset-manifest.json is not valid JSON'] };
  }

  // Scan the manifest content (minus the explanatory $comment) for leaked
  // confidential commercial records.
  const { $comment, ...scannable } = manifest;
  const scanText = JSON.stringify(scannable);
  for (const re of FORBIDDEN) {
    if (re.test(scanText)) errors.push(`asset-manifest.json contains a forbidden confidential field matching ${re}`);
  }

  for (const font of manifest.fonts ?? []) {
    const p = join(root, font.file);
    if (!existsSync(p)) {
      errors.push(`missing font: ${font.file}`);
      continue;
    }
    const sum = createHash('sha256').update(readFileSync(p)).digest('hex');
    if (font.sha256 && sum !== font.sha256) {
      errors.push(`checksum mismatch for ${font.file}: manifest ${font.sha256.slice(0, 12)}… != actual ${sum.slice(0, 12)}…`);
    }
  }

  // Vastago provenance must be recorded (owner confirmation), not left blank.
  if (!manifest.vastagoLicense?.provenance) errors.push('asset-manifest.json: vastagoLicense.provenance is required');

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { ok, errors } = verifyAssets(getRoot());
  if (!ok) {
    console.error('asset verification FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    exit(1);
  }
  console.log('asset verification passed');
}
