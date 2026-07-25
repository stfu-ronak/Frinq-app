#!/usr/bin/env node
// Scans a REAL built Android release APK before it ships: dev/localhost
// endpoints, test phone/OTP fixtures, server/service-account secrets,
// WebView/Capacitor/Expo fingerprints, wrong app id, debug signing, and
// missing 16KB page-size ELF alignment (the current Android compatibility
// requirement — 64-bit native libraries only; Google explicitly exempts
// 32-bit ABIs from this requirement).
//
// String-content checks (dev endpoints, secrets, test fixtures, framework
// fingerprints) are scoped to files under assets/ (the JS bundle + any raw
// assets) — the only artifact this app's own code controls. Scanning the
// whole APK byte-for-byte was tried first and produced nothing but false
// positives: classes*.dex and resources.arsc are packed with third-party
// SDK/AOSP string pools (Play Services' own "10.0.2.2"/"10.0.3.2" emulator-
// detection constants, "google_auth_service_accounts", the standard Android
// XML namespace URIs every compiled APK contains) that have nothing to do
// with this app's configuration. Even within assets/, Hermes's string table
// packs literals with no separator between entries, so a naive substring
// scan can glue two unrelated adjacent strings into something that LOOKS
// like a bad match (e.g. "clientHeight" + "/api/v1/..." reads as
// ".../api/v1/..." — never an actual "http://" prefix in source). Checking
// EXACT known-bad literals (this app's real hostnames, the dev IP aliases)
// rather than an open-ended "any http://..." pattern avoids both classes of
// false positive.
//
// Requires `unzip` and `apksigner` on PATH/SDK (present on every Linux/Mac CI
// image with the Android SDK, and on this dev machine) — reused rather than
// adding a zip-parsing npm dependency. The 16KB check shells out to the
// NDK's own llvm-readelf under $ANDROID_HOME/ndk/<version>/toolchains/llvm/prebuilt/*/bin/.
//
// Usage: node scripts/verify-release-artifact.mjs [--apk <path>]

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { argv, exit, cwd, env } from "node:process";

const APP_ID = "in.frinq.app";
// The only hosts this app's own code should ever reference in cleartext form.
// Anything else showing up as "http://<one-of-these>" in the JS bundle is a
// real finding; nothing else is (see the file-header note on false positives).
const FORBIDDEN_CLEARTEXT_HOSTS = ["api.frinq.in", "frinq.in", "10.0.2.2", "localhost", "127.0.0.1"];

function getArg(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Same technique the Unix `strings` tool uses: runs of >=6 printable ASCII
// bytes. Works for plain text files and binaries alike (Hermes bytecode's
// string table stores literal string constants as contiguous raw bytes).
function extractStrings(buf) {
  const out = [];
  let run = [];
  for (const byte of buf) {
    if (byte >= 0x20 && byte < 0x7f) {
      run.push(byte);
    } else {
      if (run.length >= 6) out.push(Buffer.from(run).toString("ascii"));
      run = [];
    }
  }
  if (run.length >= 6) out.push(Buffer.from(run).toString("ascii"));
  return out.join("\n");
}

function findLlvmReadelf(androidHome) {
  if (!androidHome) return null;
  const ndkRoot = join(androidHome, "ndk");
  if (!existsSync(ndkRoot)) return null;
  for (const v of readdirSync(ndkRoot).sort().reverse()) {
    for (const rel of [
      ["toolchains", "llvm", "prebuilt", "windows-x86_64", "bin", "llvm-readelf.exe"],
      ["toolchains", "llvm", "prebuilt", "linux-x86_64", "bin", "llvm-readelf"],
      ["toolchains", "llvm", "prebuilt", "darwin-x86_64", "bin", "llvm-readelf"],
    ]) {
      const p = join(ndkRoot, v, ...rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function findApksigner(androidHome) {
  if (!androidHome) return null;
  const buildTools = join(androidHome, "build-tools");
  if (!existsSync(buildTools)) return null;
  for (const v of readdirSync(buildTools).sort().reverse()) {
    for (const name of ["apksigner.bat", "apksigner"]) {
      const p = join(buildTools, v, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// Google's 16KB page-size migration applies to 64-bit native libraries only —
// 32-bit ABIs (armeabi-v7a, x86) are explicitly exempt.
const ABIS_REQUIRING_16KB = ["arm64-v8a", "x86_64"];

export function verifyReleaseArtifact(apkPath, { androidHome = env.ANDROID_HOME } = {}) {
  const errors = [];
  if (!apkPath || !existsSync(apkPath)) {
    return { ok: false, errors: [`release artifact not found: ${apkPath ?? "(none given)"}`] };
  }

  const dir = mkdtempSync(join(tmpdir(), "frinq-release-scan-"));
  try {
    execFileSync("unzip", ["-o", "-q", apkPath, "-d", dir]);
    const allFiles = walk(dir);

    // --- Content checks: assets/ only (the JS bundle + any raw assets). ---
    const assetFiles = allFiles.filter((f) => f.slice(dir.length + 1).replace(/\\/g, "/").startsWith("assets/"));
    const assetHaystack = assetFiles.map((f) => extractStrings(readFileSync(f))).join("\n");

    for (const host of FORBIDDEN_CLEARTEXT_HOSTS) {
      if (assetHaystack.includes(`http://${host}`)) errors.push(`cleartext http://${host} baked into the release JS bundle`);
    }

    for (const marker of ["CapacitorWebView", "ionic://", "expo-modules-core"]) {
      if (assetHaystack.includes(marker)) errors.push(`forbidden framework fingerprint in release JS bundle: ${marker}`);
    }

    for (const marker of ['"private_key":', "BEGIN PRIVATE KEY", "BEGIN RSA PRIVATE KEY"]) {
      if (assetHaystack.includes(marker)) errors.push(`possible embedded secret/private key in release JS bundle: ${marker}`);
    }

    // Real test-fixture phone numbers used across this session's seed/test scripts.
    for (const marker of ["8000000001", "8000000002", "8000000003"]) {
      if (assetHaystack.includes(marker)) errors.push(`test fixture phone number found in release JS bundle: ${marker}`);
    }

    // A real google-services.json/service-account JSON accidentally bundled as
    // a raw asset would show up as a file name here, not just a string match.
    const suspiciousAssetNames = assetFiles.filter((f) => /google-services\.json|service.?account.*\.json/i.test(f));
    for (const f of suspiciousAssetNames) errors.push(`credential-shaped file bundled as a raw asset: ${f.slice(dir.length + 1)}`);

    // Disallowed source maps — a .map file (or a live sourceMappingURL
    // pointing at a real bundled map, not just Metro's dev-only inline
    // placeholder) would let anyone reconstruct readable source from a
    // shipped release build.
    const sourceMapFiles = assetFiles.filter((f) => f.endsWith(".map"));
    for (const f of sourceMapFiles) errors.push(`source map bundled in release artifact: ${f.slice(dir.length + 1)}`);
    if (/sourceMappingURL=(?!data:)/.test(assetHaystack)) {
      errors.push("release JS bundle references an external source map (sourceMappingURL)");
    }

    // A hardcoded example/test bearer token left in source would be a real
    // credential if it happens to still be valid — distinct from the
    // private-key/service-account checks above.
    const bearerExample = assetHaystack.match(/Bearer [A-Za-z0-9_-]{20,}/);
    if (bearerExample) errors.push(`hardcoded bearer-token example in release JS bundle: ${bearerExample[0].slice(0, 30)}...`);

    // --- App id presence: safe to check across the whole artifact. ---
    const wholeHaystack = allFiles.map((f) => extractStrings(readFileSync(f))).join("\n");
    if (!wholeHaystack.includes(APP_ID)) errors.push(`applicationId "${APP_ID}" not found anywhere in the built artifact`);

    // --- Debug signing: ask apksigner directly rather than guess from strings. ---
    const apksigner = findApksigner(androidHome);
    if (!apksigner) {
      errors.push("could not verify release signing — apksigner not found under $ANDROID_HOME/build-tools");
    } else {
      let certOut = "";
      try {
        // apksigner ships as a .bat on Windows — not directly spawnable
        // without a shell (unlike the NDK's llvm-readelf .exe above).
        certOut = execFileSync(apksigner, ["verify", "--print-certs", apkPath], { encoding: "utf8", shell: true });
      } catch (e) {
        certOut = `${e.stdout || ""}${e.stderr || ""}`;
      }
      if (/CN=Android Debug\b/.test(certOut)) {
        errors.push("release artifact is signed with the standard Android debug certificate (CN=Android Debug) — not a real release signature");
      }
    }

    // --- 16KB page-size ELF alignment, 64-bit ABIs only. ---
    const readelf = findLlvmReadelf(androidHome);
    const soFiles64 = allFiles.filter(
      (f) => f.endsWith(".so") && ABIS_REQUIRING_16KB.some((abi) => f.replace(/\\/g, "/").includes(`/${abi}/`)),
    );
    if (!readelf) {
      errors.push("could not verify 16KB page-size ELF alignment — llvm-readelf not found under $ANDROID_HOME/ndk");
    } else if (soFiles64.length === 0) {
      errors.push("no 64-bit (.so) native libraries found to check for 16KB alignment");
    } else {
      for (const so of soFiles64) {
        let out;
        try {
          out = execFileSync(readelf, ["-lW", so], { encoding: "utf8" });
        } catch {
          errors.push(`llvm-readelf failed to read ${so.slice(dir.length + 1)}`);
          continue;
        }
        const misaligned = out
          .split("\n")
          .filter((l) => l.trim().startsWith("LOAD"))
          .some((line) => {
            const align = parseInt(line.trim().split(/\s+/).pop(), 16);
            return !Number.isNaN(align) && align < 0x4000;
          });
        if (misaligned) errors.push(`${so.slice(dir.length + 1)}: has a LOAD segment aligned below 16KB (0x4000) — not 16KB-page-size compatible`);
      }
    }

    return { ok: errors.length === 0, errors };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const apkPath = getArg("--apk", join(cwd(), "android/app/build/outputs/apk/release/app-release.apk"));
  const { ok, errors } = verifyReleaseArtifact(apkPath);
  if (!ok) {
    console.error("release-artifact verification FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    exit(1);
  }
  console.log("release-artifact verification passed");
}
