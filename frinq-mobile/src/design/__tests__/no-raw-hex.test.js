/**
 * Guard: screens/components must consume semantic color tokens, never inline
 * hex. Only src/design/tokens/ may contain raw hex. Written in JS (not tsc-
 * checked) so it can use node fs without pulling node globals into the app's
 * TypeScript types.
 */
const { readdirSync, readFileSync, statSync } = require('fs');
const { join, extname } = require('path');

const DESIGN_DIR = join(__dirname, '..');
const TOKENS_DIR = join(DESIGN_DIR, 'tokens');
const HEX = /#[0-9a-fA-F]{3,8}\b/;

function collect(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (full.startsWith(TOKENS_DIR)) continue; // tokens/ may hold hex
    if (e === '__tests__') continue;
    const st = statSync(full);
    if (st.isDirectory()) collect(full, out);
    else if (['.ts', '.tsx'].includes(extname(e))) out.push(full);
  }
  return out;
}

test('no inline hex outside src/design/tokens', () => {
  const offenders = [];
  for (const file of collect(DESIGN_DIR)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((ln, i) => {
        if (HEX.test(ln)) offenders.push(`${file}:${i + 1}: ${ln.trim()}`);
      });
  }
  expect(offenders).toEqual([]);
});
