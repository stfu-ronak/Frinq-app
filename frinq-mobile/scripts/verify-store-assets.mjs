#!/usr/bin/env node
// Deterministic store-readiness gate (Task 41 Step 5). Reads the ACTUAL icon
// files, manifests, plists, and store/ docs and exits nonzero if anything a
// real submission would need is missing, wrong-shaped, or forbidden.
//
// Usage: node scripts/verify-store-assets.mjs [--root <dir>]

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit, cwd } from "node:process";
import sharp from "sharp";

const FORBIDDEN_ANDROID_PERMISSIONS = [
  "android.permission.CAMERA",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.READ_CONTACTS",
  "android.permission.WRITE_CONTACTS",
  "android.permission.READ_SMS",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.BLUETOOTH",
];

const ANDROID_LAUNCHER_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ANDROID_ADAPTIVE_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const IOS_ICON_PIXEL_SIZES = {
  "icon-20@2x.png": 40,
  "icon-20@3x.png": 60,
  "icon-29@2x.png": 58,
  "icon-29@3x.png": 87,
  "icon-40@2x.png": 80,
  "icon-40@3x.png": 120,
  "icon-60@2x.png": 120,
  "icon-60@3x.png": 180,
  "icon-1024.png": 1024,
};

function getRoot() {
  const i = argv.indexOf("--root");
  return i !== -1 && argv[i + 1] ? argv[i + 1] : cwd();
}

function readText(root, rel, errors) {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    errors.push(`missing file: ${rel}`);
    return null;
  }
}

async function checkPng(root, rel, expectedSize, { requireOpaque = false } = {}) {
  const errors = [];
  const full = join(root, rel);
  if (!existsSync(full)) {
    errors.push(`missing icon file: ${rel}`);
    return errors;
  }
  let meta;
  try {
    meta = await sharp(full).metadata();
  } catch {
    errors.push(`${rel}: not a readable image`);
    return errors;
  }
  if (meta.width !== expectedSize || meta.height !== expectedSize) {
    errors.push(`${rel}: expected ${expectedSize}x${expectedSize}, got ${meta.width}x${meta.height}`);
  }
  if (requireOpaque && meta.hasAlpha) {
    errors.push(`${rel}: has an alpha channel — App Store marketing icon must be fully opaque`);
  }
  return errors;
}

export async function verifyStoreAssets(root) {
  const errors = [];

  // --- Android icons: legacy launcher + adaptive foreground, real dimensions ---
  for (const [density, size] of Object.entries(ANDROID_LAUNCHER_SIZES)) {
    errors.push(...(await checkPng(root, `android/app/src/main/res/mipmap-${density}/ic_launcher.png`, size)));
    errors.push(...(await checkPng(root, `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, size)));
  }
  for (const [density, size] of Object.entries(ANDROID_ADAPTIVE_SIZES)) {
    errors.push(...(await checkPng(root, `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, size)));
  }
  for (const rel of ["mipmap-anydpi-v26/ic_launcher.xml", "mipmap-anydpi-v26/ic_launcher_round.xml"]) {
    if (!existsSync(join(root, "android/app/src/main/res", rel))) errors.push(`missing adaptive icon config: ${rel}`);
  }

  // --- iOS icons: every Contents.json slot has a filename, and that file is the right size ---
  const iosDir = "ios/FrinqMobile/Images.xcassets/AppIcon.appiconset";
  const contentsPath = join(root, iosDir, "Contents.json");
  if (!existsSync(contentsPath)) {
    errors.push(`missing file: ${iosDir}/Contents.json`);
  } else {
    const contents = JSON.parse(readFileSync(contentsPath, "utf8"));
    for (const img of contents.images) {
      if (!img.filename) {
        errors.push(`${iosDir}/Contents.json: ${img.idiom} ${img.size}@${img.scale} has no filename assigned`);
        continue;
      }
      const expected = IOS_ICON_PIXEL_SIZES[img.filename];
      if (expected === undefined) continue; // unknown filename, not this script's concern
      errors.push(...(await checkPng(root, `${iosDir}/${img.filename}`, expected, { requireOpaque: img.idiom === "ios-marketing" })));
    }
  }

  // --- Android manifest: backup rule + no forbidden permissions ---
  const manifest = readText(root, "android/app/src/main/AndroidManifest.xml", errors);
  if (manifest !== null) {
    if (!/android:allowBackup\s*=\s*"false"/.test(manifest)) {
      errors.push('AndroidManifest.xml: expected android:allowBackup="false" (or a documented dataExtractionRules override)');
    }
    for (const perm of FORBIDDEN_ANDROID_PERMISSIONS) {
      if (manifest.includes(perm)) errors.push(`AndroidManifest.xml: forbidden permission declared: ${perm}`);
    }
  }

  // --- iOS Info.plist: microphone usage string + export-compliance declaration ---
  const plist = readText(root, "ios/FrinqMobile/Info.plist", errors);
  if (plist !== null) {
    if (!/<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]{10,}<\/string>/.test(plist))
      errors.push("Info.plist: NSMicrophoneUsageDescription missing or too short to be a real explanation");
    if (!/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<(true|false)\/>/.test(plist))
      errors.push("Info.plist: ITSAppUsesNonExemptEncryption not declared (export-compliance value must be explicit)");
    // No URL schemes should be declared unless a real deep-link feature exists —
    // none does today, so any presence is either accidental or undocumented.
    if (/<key>CFBundleURLTypes<\/key>/.test(plist))
      errors.push("Info.plist: CFBundleURLTypes present but this app has no documented deep-link feature — confirm intentional");
  }

  // --- iOS privacy manifest: exists, parses, tracking is false ---
  const privacyManifest = readText(root, "ios/FrinqMobile/PrivacyInfo.xcprivacy", errors);
  if (privacyManifest !== null) {
    if (!/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(privacyManifest))
      errors.push("PrivacyInfo.xcprivacy: NSPrivacyTracking must be false (this app does no cross-app/cross-site tracking)");
    if (!/<key>NSPrivacyAccessedAPITypes<\/key>/.test(privacyManifest))
      errors.push("PrivacyInfo.xcprivacy: missing NSPrivacyAccessedAPITypes array");
  }

  // --- Release endpoint: production API base URL is HTTPS, not a dev alias ---
  const config = readText(root, "src/services/api/config.ts", errors);
  if (config !== null) {
    const prodMatch = config.match(/__DEV__\s*\?\s*DEV_BASE_URL\s*:\s*['"]([^'"]+)['"]/);
    if (!prodMatch) {
      errors.push("src/services/api/config.ts: could not find the production API_BASE_URL branch");
    } else if (!prodMatch[1].startsWith("https://")) {
      errors.push(`src/services/api/config.ts: production API base URL must be HTTPS, got: ${prodMatch[1]}`);
    }
  }

  // --- Font/license evidence still present (Task 27) ---
  if (!existsSync(join(root, "THIRD_PARTY_NOTICES.md"))) errors.push("missing THIRD_PARTY_NOTICES.md (font/license evidence)");

  // --- Versions present and non-empty ---
  const appGradle = readText(root, "android/app/build.gradle", errors);
  if (appGradle !== null) {
    if (!/versionCode\s+\d+/.test(appGradle)) errors.push("android/app/build.gradle: versionCode missing");
    if (!/versionName\s+["'][^"']+["']/.test(appGradle)) errors.push("android/app/build.gradle: versionName missing");
  }

  // --- store/ docs this task is supposed to produce ---
  for (const rel of [
    "store/metadata/en-IN.md",
    "store/privacy-data-inventory.md",
    "store/reviewer-notes.md",
    "store/territory-review.md",
  ]) {
    if (!existsSync(join(root, rel))) errors.push(`missing store doc: ${rel}`);
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { ok, errors } = await verifyStoreAssets(getRoot());
  if (!ok) {
    console.error("store-assets verification FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    exit(1);
  }
  console.log("store-assets verification passed");
}
