#!/usr/bin/env node
// Deterministic native-identity/platform gate. Reads the ACTUAL Gradle,
// manifest, strings, Xcode pbxproj, Info.plist, and gradle.properties and
// exits nonzero if project identity, OS floors/targets, cleartext policy, or
// New Architecture / Hermes settings drift from the approved values.
//
// Usage: node scripts/verify-native-config.mjs [--root <dir>]
// Default root = process.cwd(). Tests point --root at fixture trees.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit, cwd } from "node:process";

const APP_ID = "in.frinq.app"; // store-facing (Android applicationId + iOS bundle id)
const CODE_NAMESPACE = "app.frinq"; // keyword-safe Android code namespace ("in" is a Kotlin keyword)
const DISPLAY_NAME = "Frinq";
const MIN_SDK = 24;
const COMPILE_SDK = 36;
const TARGET_SDK = 36;
const IOS_TARGET = "15.1";

function getRoot() {
  const i = argv.indexOf("--root");
  return i !== -1 && argv[i + 1] ? argv[i + 1] : cwd();
}

function read(root, rel, errors) {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    errors.push(`missing file: ${rel}`);
    return null;
  }
}

export function verifyNativeConfig(root) {
  const errors = [];

  // --- Android app module identity ---
  const appGradle = read(root, "android/app/build.gradle", errors);
  if (appGradle !== null) {
    if (!new RegExp(`applicationId\\s+["']${APP_ID.replace(/\./g, "\\.")}["']`).test(appGradle))
      errors.push(`android/app/build.gradle: applicationId must be "${APP_ID}"`);
    if (!new RegExp(`namespace\\s+["']${CODE_NAMESPACE.replace(/\./g, "\\.")}["']`).test(appGradle))
      errors.push(`android/app/build.gradle: namespace must be "${CODE_NAMESPACE}"`);
  }

  // --- Android SDK floors/targets ---
  const rootGradle = read(root, "android/build.gradle", errors);
  if (rootGradle !== null) {
    const num = (key) => {
      const m = rootGradle.match(new RegExp(`${key}\\s*=\\s*(\\d+)`));
      return m ? Number(m[1]) : null;
    };
    if (num("minSdkVersion") !== MIN_SDK) errors.push(`android/build.gradle: minSdkVersion must be ${MIN_SDK}`);
    if (num("compileSdkVersion") !== COMPILE_SDK) errors.push(`android/build.gradle: compileSdkVersion must be ${COMPILE_SDK}`);
    if (num("targetSdkVersion") !== TARGET_SDK) errors.push(`android/build.gradle: targetSdkVersion must be ${TARGET_SDK}`);
  }

  // --- New Architecture + Hermes ---
  const gradleProps = read(root, "android/gradle.properties", errors);
  if (gradleProps !== null) {
    if (!/^\s*newArchEnabled\s*=\s*true\s*$/m.test(gradleProps))
      errors.push("android/gradle.properties: newArchEnabled must be true");
    if (!/^\s*hermesEnabled\s*=\s*true\s*$/m.test(gradleProps))
      errors.push("android/gradle.properties: hermesEnabled must be true");
  }

  // --- Cleartext policy (release = false via RN gradle-plugin placeholder) ---
  const manifest = read(root, "android/app/src/main/AndroidManifest.xml", errors);
  if (manifest !== null) {
    if (/android:usesCleartextTraffic\s*=\s*"true"/.test(manifest))
      errors.push("AndroidManifest.xml: usesCleartextTraffic must not be hardcoded true (release must disable cleartext)");
    else if (!/android:usesCleartextTraffic\s*=\s*"\$\{usesCleartextTraffic\}"/.test(manifest))
      errors.push('AndroidManifest.xml: expected android:usesCleartextTraffic="${usesCleartextTraffic}" placeholder (RN plugin sets release=false)');
  }

  // --- Android display name ---
  const strings = read(root, "android/app/src/main/res/values/strings.xml", errors);
  if (strings !== null && !new RegExp(`<string name="app_name">${DISPLAY_NAME}</string>`).test(strings))
    errors.push(`strings.xml: app_name must be "${DISPLAY_NAME}"`);

  // --- iOS bundle id + deployment target ---
  const pbx = read(root, "ios/FrinqMobile.xcodeproj/project.pbxproj", errors);
  if (pbx !== null) {
    if (!new RegExp(`PRODUCT_BUNDLE_IDENTIFIER\\s*=\\s*"${APP_ID.replace(/\./g, "\\.")}"`).test(pbx))
      errors.push(`project.pbxproj: PRODUCT_BUNDLE_IDENTIFIER must be "${APP_ID}"`);
    if (/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"org\.reactjs\.native\.example/.test(pbx))
      errors.push("project.pbxproj: default org.reactjs.native.example bundle id still present");
    const targets = [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*([\d.]+)/g)].map((m) => m[1]);
    if (targets.length === 0 || targets.some((t) => t !== IOS_TARGET))
      errors.push(`project.pbxproj: every IPHONEOS_DEPLOYMENT_TARGET must be ${IOS_TARGET}`);
  }

  // --- iOS display name ---
  const plist = read(root, "ios/FrinqMobile/Info.plist", errors);
  if (plist !== null && !new RegExp(`<key>CFBundleDisplayName</key>\\s*<string>${DISPLAY_NAME}</string>`).test(plist))
    errors.push(`Info.plist: CFBundleDisplayName must be "${DISPLAY_NAME}"`);

  // --- Kotlin host package is keyword-safe app.frinq ---
  const mainApp = read(root, "android/app/src/main/java/app/frinq/MainApplication.kt", errors);
  if (mainApp !== null && !/^package\s+app\.frinq\s*$/m.test(mainApp))
    errors.push("MainApplication.kt: package must be app.frinq");

  return { ok: errors.length === 0, errors };
}

// Run when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { ok, errors } = verifyNativeConfig(getRoot());
  if (!ok) {
    console.error("native-config verification FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    exit(1);
  }
  console.log("native-config verification passed");
}
