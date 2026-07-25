/**
 * Negative + positive tests for the native-config and no-webview verifiers.
 * The scripts are run as real CLI child processes against generated fixture
 * trees so we test the actual `node script.mjs --root <dir>` behavior and exit
 * codes, not an imported function.
 */
const { execFileSync } = require('child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
const { join, dirname } = require('path');
const os = require('os');

const SCRIPTS = join(__dirname, '..', 'scripts');
const CONFIG = join(SCRIPTS, 'verify-native-config.mjs');
const NOWEB = join(SCRIPTS, 'verify-no-webview.mjs');
const ASSETS = join(SCRIPTS, 'verify-assets.mjs');
const CONTRACTS = join(SCRIPTS, 'verify-contracts.mjs');
const RELEASE_ARTIFACT = join(SCRIPTS, 'verify-release-artifact.mjs');
const STORE_ASSETS = join(SCRIPTS, 'verify-store-assets.mjs');
const PROJECT_ROOT = join(__dirname, '..');

function run(script, root) {
  try {
    const stdout = execFileSync('node', [script, '--root', root], { encoding: 'utf8' });
    return { status: 0, out: stdout };
  } catch (e) {
    return { status: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

// --- minimal valid fixture tree that both verifiers pass ---
const VALID = {
  'android/app/build.gradle': `android {\n  namespace "app.frinq"\n  defaultConfig {\n    applicationId "in.frinq.app"\n  }\n}`,
  'android/build.gradle': `ext {\n  buildToolsVersion = "36.0.0"\n  minSdkVersion = 24\n  compileSdkVersion = 36\n  targetSdkVersion = 36\n}`,
  'android/gradle.properties': `newArchEnabled=true\nhermesEnabled=true\n`,
  'android/app/src/main/AndroidManifest.xml': `<manifest><application android:usesCleartextTraffic="\${usesCleartextTraffic}"/></manifest>`,
  'android/app/src/main/res/values/strings.xml': `<resources><string name="app_name">Frinq</string></resources>`,
  'ios/FrinqMobile.xcodeproj/project.pbxproj': `PRODUCT_BUNDLE_IDENTIFIER = "in.frinq.app";\nIPHONEOS_DEPLOYMENT_TARGET = 15.1;`,
  'ios/FrinqMobile/Info.plist': `<key>CFBundleDisplayName</key>\n<string>Frinq</string>`,
  'android/app/src/main/java/app/frinq/MainApplication.kt': `package app.frinq\n`,
  'package.json': JSON.stringify({
    name: 'FrinqMobile',
    dependencies: { react: '19.2.3', 'react-native': '0.86.0' },
    devDependencies: { jest: '^29.6.3' },
  }),
  'package-lock.json': JSON.stringify({
    name: 'FrinqMobile',
    packages: { '': {}, 'node_modules/react-native': {}, 'node_modules/exponential-backoff': {} },
  }),
};

function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function fixture(overrides = {}) {
  const dir = mkdtempSync(join(os.tmpdir(), 'frinq-fx-'));
  writeTree(dir, { ...VALID, ...overrides });
  return dir;
}

const dirs = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function tmp(overrides) {
  const d = fixture(overrides);
  dirs.push(d);
  return d;
}

describe('verify-native-config', () => {
  test('passes on the valid fixture tree', () => {
    expect(run(CONFIG, tmp()).status).toBe(0);
  });

  test('passes on the real project root', () => {
    expect(run(CONFIG, PROJECT_ROOT).status).toBe(0);
  });

  test('fails on a wrong iOS bundle id', () => {
    const r = run(CONFIG, tmp({
      'ios/FrinqMobile.xcodeproj/project.pbxproj': `PRODUCT_BUNDLE_IDENTIFIER = "org.reactjs.native.example.FrinqMobile";\nIPHONEOS_DEPLOYMENT_TARGET = 15.1;`,
    }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/PRODUCT_BUNDLE_IDENTIFIER must be "in\.frinq\.app"/);
  });

  test('fails when New Architecture is disabled', () => {
    const r = run(CONFIG, tmp({ 'android/gradle.properties': `newArchEnabled=false\nhermesEnabled=true\n` }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/newArchEnabled must be true/);
  });

  test('fails on a wrong Android SDK floor', () => {
    const r = run(CONFIG, tmp({
      'android/build.gradle': `ext {\n  buildToolsVersion = "36.0.0"\n  minSdkVersion = 21\n  compileSdkVersion = 36\n  targetSdkVersion = 36\n}`,
    }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/minSdkVersion must be 24/);
  });

  test('fails when cleartext is hardcoded true', () => {
    const r = run(CONFIG, tmp({
      'android/app/src/main/AndroidManifest.xml': `<manifest><application android:usesCleartextTraffic="true"/></manifest>`,
    }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/usesCleartextTraffic must not be hardcoded true/);
  });
});

describe('verify-no-webview', () => {
  test('passes on the valid fixture tree', () => {
    expect(run(NOWEB, tmp()).status).toBe(0);
  });

  test('passes on the real project root', () => {
    expect(run(NOWEB, PROJECT_ROOT).status).toBe(0);
  });

  test('fails on a Capacitor dependency', () => {
    const r = run(NOWEB, tmp({
      'package.json': JSON.stringify({ dependencies: { '@capacitor/core': '^6.0.0' } }),
    }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/forbidden dependency in package\.json: @capacitor\/core/);
  });

  test('fails on an Expo dependency', () => {
    const r = run(NOWEB, tmp({ 'package.json': JSON.stringify({ dependencies: { expo: '^52.0.0' } }) }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/forbidden dependency in package\.json: expo/);
  });

  test('fails on a react-native-webview dependency', () => {
    const r = run(NOWEB, tmp({
      'package.json': JSON.stringify({ dependencies: { 'react-native-webview': '^13.0.0' } }),
    }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/forbidden dependency in package\.json: react-native-webview/);
  });

  test('fails on a cleartext http:// production endpoint in src', () => {
    const r = run(NOWEB, tmp({ 'src/config.ts': `export const API = "http://api.frinq.in";\n` }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/cleartext http:\/\/ endpoint/);
  });

  test('does not false-positive on exponential-backoff in the lockfile', () => {
    // VALID lockfile already contains node_modules/exponential-backoff
    expect(run(NOWEB, tmp()).status).toBe(0);
  });
});

describe('verify-assets', () => {
  const FONT = 'src/assets/fonts/Test-Regular.ttf';
  const goodManifest = (sha) => JSON.stringify({
    fonts: [{ file: FONT, family: 'Test', sha256: sha }],
    vastagoLicense: { provenance: 'owner confirmed 2026-07-23' },
  });
  // sha256 of the bytes "font-bytes"
  const SHA = require('crypto').createHash('sha256').update('font-bytes').digest('hex');

  test('passes on the real project', () => {
    expect(run(ASSETS, PROJECT_ROOT).status).toBe(0);
  });

  test('passes when manifest checksum matches the file', () => {
    const dir = tmp({ 'src/assets/asset-manifest.json': goodManifest(SHA), [FONT]: 'font-bytes', 'THIRD_PARTY_NOTICES.md': 'x' });
    expect(run(ASSETS, dir).status).toBe(0);
  });

  test('fails on a checksum mismatch', () => {
    const dir = tmp({ 'src/assets/asset-manifest.json': goodManifest('deadbeef'), [FONT]: 'font-bytes', 'THIRD_PARTY_NOTICES.md': 'x' });
    const r = run(ASSETS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/checksum mismatch/);
  });

  test('fails on a missing font file', () => {
    const dir = tmp({ 'src/assets/asset-manifest.json': goodManifest(SHA), 'THIRD_PARTY_NOTICES.md': 'x' });
    const r = run(ASSETS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/missing font/);
  });

  test('fails when THIRD_PARTY_NOTICES.md is absent', () => {
    const dir = tmp({ 'src/assets/asset-manifest.json': goodManifest(SHA), [FONT]: 'font-bytes' });
    const r = run(ASSETS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/THIRD_PARTY_NOTICES/);
  });

  test('fails if a confidential record leaks into the manifest', () => {
    const bad = JSON.stringify({ fonts: [], vastagoLicense: { provenance: 'ok', receipt: 'INV-123' } });
    const dir = tmp({ 'src/assets/asset-manifest.json': bad, 'THIRD_PARTY_NOTICES.md': 'x' });
    const r = run(ASSETS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/forbidden confidential field/);
  });
});

describe('verify-contracts', () => {
  // Minimal schema set satisfying scripts/verify-contracts.mjs's MANIFEST.
  const VALID_SCHEMAS = {
    UserResponse: { required: ['id', 'created_at', 'updated_at'], properties: { id: {}, created_at: {}, updated_at: {}, phone: {} } },
    CurrentLegalResponse: { required: ['terms_version', 'privacy_version'], properties: { terms_version: {}, privacy_version: {} } },
    RefreshResponse: { required: ['access_token', 'refresh_token'], properties: { access_token: {}, refresh_token: {} } },
    VerifyOTPResponse: { required: ['access_token', 'refresh_token', 'user'], properties: { access_token: {}, refresh_token: {}, user: {}, prior_session: {} } },
    ReauthTokenResponse: { required: ['reauth_token', 'expires_in'], properties: { reauth_token: {}, expires_in: {} } },
    PriorSession: { required: ['submission_id', 'answers'], properties: { submission_id: {}, answers: {} } },
    QuizSummaryResponse: {
      required: ['submission_id', 'status'],
      properties: {
        submission_id: {}, status: {}, name: {}, headline: {}, archetype: {}, archetype_desc: {},
        share_quote: {}, spirit_animal: {}, spirit_desc: {}, insights: {}, tags: {}, share_card: {}, deep_summary: {},
      },
    },
    InsightItem: { required: ['label', 'text'], properties: { label: {}, text: {} } },
    UserDeleteResponse: { required: ['id', 'deleted_at'], properties: { id: {}, deleted_at: {} } },
    CommunityMeResponse: {
      required: ['archetype_slug', 'name', 'description', 'muted', 'joined_at'],
      properties: { archetype_slug: {}, name: {}, description: {}, muted: {}, joined_at: {} },
    },
    PublicAuthor: { required: ['id'], properties: { id: {}, display_name: {}, avatar_key: {}, archetype_slug: {} } },
    MessageOut: {
      required: ['id', 'client_message_id', 'body', 'created_at', 'author'],
      properties: { id: {}, client_message_id: {}, body: {}, created_at: {}, author: {} },
    },
    MessageHistoryResponse: { required: ['messages'], properties: { messages: {}, next_cursor: {} } },
    WsTicketResponse: { required: ['ticket'], properties: { ticket: {}, expires_in: {} } },
  };
  const snapshot = (schemas) => JSON.stringify({ components: { schemas } });

  test('passes on the real project (committed snapshot vs contracts.ts)', () => {
    expect(run(CONTRACTS, PROJECT_ROOT).status).toBe(0);
  });

  test('passes on a valid fixture snapshot', () => {
    const dir = tmp({ 'docs/openapi-snapshot.json': snapshot(VALID_SCHEMAS) });
    expect(run(CONTRACTS, dir).status).toBe(0);
  });

  test('fails when a mirrored schema is removed from the backend', () => {
    const { UserResponse, ...rest } = VALID_SCHEMAS;
    const dir = tmp({ 'docs/openapi-snapshot.json': snapshot(rest) });
    const r = run(CONTRACTS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/UserResponse: not present/);
  });

  test('fails when an expected required field disappears', () => {
    const schemas = { ...VALID_SCHEMAS, ReauthTokenResponse: { required: ['reauth_token'], properties: { reauth_token: {} } } };
    const dir = tmp({ 'docs/openapi-snapshot.json': snapshot(schemas) });
    const r = run(CONTRACTS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/ReauthTokenResponse\.expires_in: expected field is gone/);
  });

  test('fails when the backend demotes a required field to optional', () => {
    const schemas = { ...VALID_SCHEMAS, RefreshResponse: { required: ['access_token'], properties: { access_token: {}, refresh_token: {} } } };
    const dir = tmp({ 'docs/openapi-snapshot.json': snapshot(schemas) });
    const r = run(CONTRACTS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/RefreshResponse\.refresh_token: backend made this optional/);
  });

  test('fails when the backend adds an undeclared field', () => {
    const schemas = { ...VALID_SCHEMAS, UserResponse: { ...VALID_SCHEMAS.UserResponse, properties: { ...VALID_SCHEMAS.UserResponse.properties, brand_new_field: {} } } };
    const dir = tmp({ 'docs/openapi-snapshot.json': snapshot(schemas) });
    const r = run(CONTRACTS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/UserResponse\.brand_new_field: new backend field not declared/);
  });

  test('fails when the snapshot file is missing', () => {
    const dir = tmp({});
    const r = run(CONTRACTS, dir);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/missing docs\/openapi-snapshot\.json/);
  });
});

describe('verify-release-artifact', () => {
  // Building a real fixture APK (a zip with a Hermes bundle, dex, and a
  // signed cert) isn't worth hand-rolling a zip writer for — this script's
  // real verification is running it against an actual built release APK
  // (documented in the Task 40 ledger entry, run manually since a release
  // build isn't produced by every `npm run verify`). This covers the one
  // path that's always deterministic regardless of environment.
  test('fails clearly when the given APK path does not exist', () => {
    let r;
    try {
      r = { status: 0, out: execFileSync('node', [RELEASE_ARTIFACT, '--apk', join(PROJECT_ROOT, 'no-such-file.apk')], { encoding: 'utf8' }) };
    } catch (e) {
      r = { status: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
    }
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/release artifact not found/);
  });
});

describe('verify-store-assets', () => {
  // Every real check this script runs (icon pixel dimensions/alpha, manifest
  // permissions, plist strings, privacy manifest) reads real binary PNGs and
  // the actual native project files — same reasoning as verify-release-artifact
  // above: hand-rolling synthetic icon-set fixtures isn't worth it when the
  // real, always-up-to-date project tree is sitting right there to check
  // against. This is the one test that would catch a regression (a future
  // task replacing an icon with the wrong size, deleting a store doc, etc.).
  test('passes on the real project (real icons, manifests, store docs)', () => {
    const r = run(STORE_ASSETS, PROJECT_ROOT);
    if (r.status !== 0) console.error(r.out);
    expect(r.status).toBe(0);
  });
});
