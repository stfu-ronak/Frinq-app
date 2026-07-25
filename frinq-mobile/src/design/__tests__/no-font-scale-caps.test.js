/**
 * Guard: nothing in the app may cap font scaling. RN honors the OS text-size
 * setting (up to 200%+) by default; `allowFontScaling={false}` or a low
 * `maxFontSizeMultiplier` would silently opt a component out of that.
 * Written in JS (not tsc-checked), same convention as no-raw-hex.test.js.
 */
const { readdirSync, readFileSync, statSync } = require('fs');
const { join, extname } = require('path');

const SRC_DIR = join(__dirname, '..', '..');
const CAP_PATTERN = /allowFontScaling=\{false\}|maxFontSizeMultiplier=/;

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

test('no component caps font scaling anywhere in src/', () => {
  const offenders = [];
  for (const file of collect(SRC_DIR)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((ln, i) => {
        if (CAP_PATTERN.test(ln)) offenders.push(`${file}:${i + 1}: ${ln.trim()}`);
      });
  }
  expect(offenders).toEqual([]);
});
