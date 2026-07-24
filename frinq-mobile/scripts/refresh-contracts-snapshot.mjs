#!/usr/bin/env node
// Regenerates docs/openapi-snapshot.json from the FastAPI app's own
// app.openapi() (schema introspection only — no live DB/Redis connection
// needed). Not run as part of `npm run verify`: this snapshot is committed
// deliberately, reviewed by hand, and only regenerated when the backend
// contract intentionally changes. After running this, re-check
// verify-contracts.mjs's MANIFEST against the diff before committing.
//
// Usage: node scripts/refresh-contracts-snapshot.mjs [--backend <path>]

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, cwd, platform } from 'node:process';

function getBackendDir() {
  const i = argv.indexOf('--backend');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return join(cwd(), '..', 'frinq-backend');
}

const backendDir = getBackendDir();
const python = join(backendDir, '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

const code = "from app.main import app; import json, sys; json.dump(app.openapi(), sys.stdout, indent=2, sort_keys=True)";
const json = execFileSync(python, ['-c', code], {
  cwd: backendDir,
  env: { ...process.env, PYTHONPATH: '.' },
  encoding: 'utf8',
});

const outPath = join(cwd(), 'docs/openapi-snapshot.json');
writeFileSync(outPath, json + '\n');
console.log(`wrote ${outPath}`);
console.log('Review the diff, update scripts/verify-contracts.mjs MANIFEST if the mobile-consumed models changed, then commit both.');
