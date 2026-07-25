/**
 * Guard: every decorative SVG icon in the app must be hidden from
 * accessibility trees (`accessibilityElementsHidden` + `importantForAccessibility`)
 * — screen readers must never land on arrow/chevron/checkmark glyphs that
 * carry no information beyond what the surrounding labeled control already
 * announces. Written in JS (not tsc-checked), same convention as
 * no-raw-hex.test.js.
 */
const { readdirSync, readFileSync, statSync } = require('fs');
const { join, extname } = require('path');

const SRC_DIR = join(__dirname, '..', '..');
const SVG_OPEN_TAG = /<Svg\b/;
const HIDDEN_MARKER = /accessibilityElementsHidden/;
const LOOKAHEAD_LINES = 3; // covers a multi-line-formatted <Svg ...> opening tag

function collect(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (e === '__tests__' || e === 'node_modules') continue;
    const st = statSync(full);
    if (st.isDirectory()) collect(full, out);
    else if (['.ts', '.tsx'].includes(extname(e))) out.push(full);
  }
  return out;
}

test('every <Svg> icon is hidden from accessibility', () => {
  const offenders = [];
  for (const file of collect(SRC_DIR)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      if (!SVG_OPEN_TAG.test(ln)) return;
      const window = lines.slice(i, i + LOOKAHEAD_LINES).join('\n');
      if (!HIDDEN_MARKER.test(window)) offenders.push(`${file}:${i + 1}: ${ln.trim()}`);
    });
  }
  expect(offenders).toEqual([]);
});
