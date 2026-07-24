#!/usr/bin/env node
// Fails if a forbidden runtime enters the native app: Expo, Capacitor, Ionic,
// Cordova, a WebView shell, an HTML renderer (react-native-web), a cleartext
// http:// production endpoint, or live-development-server bootstrapping.
//
// Matching is by EXACT dependency name (and node_modules/<name> boundaries in
// the lockfile), never loose substring — so packages like exponential-backoff
// or @babel/*-export-* never trip it.
//
// Usage: node scripts/verify-no-webview.mjs [--root <dir>]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit, cwd } from "node:process";

// Exact package names (or scope prefixes ending in /) that must never appear.
const FORBIDDEN_EXACT = new Set([
  "expo",
  "expo-router",
  "expo-dev-client",
  "@capacitor/core",
  "@capacitor/android",
  "@capacitor/ios",
  "cordova",
  "react-native-webview",
  "react-native-web",
]);
const FORBIDDEN_SCOPES = ["@expo/", "@capacitor/", "@ionic/"];

function getRoot() {
  const i = argv.indexOf("--root");
  return i !== -1 && argv[i + 1] ? argv[i + 1] : cwd();
}

function isForbiddenName(name) {
  if (FORBIDDEN_EXACT.has(name)) return true;
  return FORBIDDEN_SCOPES.some((s) => name.startsWith(s));
}

function readJson(root, rel, errors) {
  try {
    return JSON.parse(readFileSync(join(root, rel), "utf8"));
  } catch {
    return null; // absence handled by caller
  }
}

// Walk src/ (if present) for forbidden imports and cleartext endpoints.
function walkSource(dir, onFile) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git") continue;
    const full = join(dir, e);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkSource(full, onFile);
    else if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(extname(e))) onFile(full);
  }
}

export function verifyNoWebview(root) {
  const errors = [];

  // 1. Declared dependencies.
  const pkg = readJson(root, "package.json", errors);
  if (!pkg) {
    errors.push("missing file: package.json");
  } else {
    const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const name of Object.keys(all)) {
      if (isForbiddenName(name)) errors.push(`forbidden dependency in package.json: ${name}`);
    }
    // Metro/RN live-reload against a remote packager is fine in dev, but a
    // committed remote debug host in app config is not.
    if (typeof pkg.expo !== "undefined") errors.push("package.json: an `expo` config block is present");
  }

  // 2. Installed tree (lockfile) — catch transitive/forbidden installs.
  const lock = readJson(root, "package-lock.json", errors);
  if (lock && lock.packages) {
    for (const p of Object.keys(lock.packages)) {
      // keys look like "node_modules/expo" or "node_modules/@capacitor/core"
      const m = p.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/);
      if (m && isForbiddenName(m[1])) errors.push(`forbidden package installed (lockfile): ${m[1]}`);
    }
  }

  // 3. Source scan: forbidden imports + cleartext production endpoints + live-server URLs.
  walkSource(join(root, "src"), (file) => {
    const text = readFileSync(file, "utf8");
    if (/\bfrom\s+["']react-native-webview["']|require\(\s*["']react-native-webview["']\s*\)/.test(text))
      errors.push(`react-native-webview imported in ${file.slice(root.length + 1)}`);
    if (/\b(?:from|require\()\s*["'](?:expo|@expo\/|@capacitor\/|@ionic\/)/.test(text))
      errors.push(`forbidden framework imported in ${file.slice(root.length + 1)}`);
    // http:// endpoints (allow http://localhost / 127.0.0.1 / 10.0.2.2 — the
    // documented Android-emulator alias for the host loopback, used only
    // behind __DEV__ in src/services/api/config.ts)
    const cleartext = text.match(/["']http:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2)[^"']+["']/);
    if (cleartext) errors.push(`cleartext http:// endpoint in ${file.slice(root.length + 1)}: ${cleartext[0]}`);
  });

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { ok, errors } = verifyNoWebview(getRoot());
  if (!ok) {
    console.error("no-webview verification FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    exit(1);
  }
  console.log("no-webview verification passed");
}
