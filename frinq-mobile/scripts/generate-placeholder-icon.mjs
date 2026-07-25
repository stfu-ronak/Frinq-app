#!/usr/bin/env node
// One-time generator for a PLACEHOLDER app icon/launch mark — the "quiet
// dot" motif already used by BootSplash (src/navigation/placeholders.tsx:
// cream background, small maroon dot), reused here so the icon is at least
// visually consistent with the app rather than the default RN robot icon.
// This is NOT final creative — Task 41 Step 1 flags real icon art as an
// owner-approval item. Re-run this script if the placeholder needs
// regenerating; it always overwrites the same file set deterministically.
//
// Usage: node scripts/generate-placeholder-icon.mjs

import sharp from "sharp";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAROON = "#621507";
const CREAM = "#FFFBF7";

function dotSvg(size, { dotFillRatio = 0.34, fg = CREAM, bg = MAROON, transparent = false } = {}) {
  const r = Math.round((size * dotFillRatio) / 2);
  const cx = size / 2;
  const cy = size / 2;
  const background = transparent ? "" : `<rect width="${size}" height="${size}" fill="${bg}"/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fg}"/></svg>`,
  );
}

async function renderPng(svg, size, { flatten } = {}) {
  let img = sharp(svg).resize(size, size);
  if (flatten) img = img.flatten({ background: flatten });
  return img.png().toBuffer();
}

async function writePng(path, buf) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  console.log("wrote", path.slice(ROOT.length + 1));
}

async function main() {
  // --- Android legacy launcher icons (square + round), full-bleed brand mark ---
  const ANDROID_LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, size] of Object.entries(ANDROID_LEGACY)) {
    const square = await renderPng(dotSvg(size), size);
    await writePng(join(ROOT, `android/app/src/main/res/mipmap-${density}/ic_launcher.png`), square);
    // Round variant: same art, sharp mask isn't needed — Android itself
    // clips mipmap-*/ic_launcher_round.png to a circle at render time, but
    // launchers that don't clip expect a pre-rounded asset, so mask here too.
    const roundMask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
    );
    const round = await sharp(square).composite([{ input: roundMask, blend: "dest-in" }]).png().toBuffer();
    await writePng(join(ROOT, `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`), round);
  }

  // --- Android adaptive icon foreground (108dp canvas, transparent bg; a
  // solid-color background layer is declared separately via colors.xml) ---
  const ANDROID_ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [density, size] of Object.entries(ANDROID_ADAPTIVE)) {
    // Keep the dot within the ~66dp/108dp safe zone so launcher masking
    // (circle/squircle/rounded-square) never clips it.
    const fg = await renderPng(dotSvg(size, { dotFillRatio: 0.32, transparent: true }), size);
    await writePng(join(ROOT, `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`), fg);
  }

  // --- Android notification icon: pure white silhouette on transparent,
  // required shape for the status bar (Task 39 wires this into the
  // manifest/FCM config when it resumes — this only prepares the asset) ---
  const NOTIF = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
  for (const [density, size] of Object.entries(NOTIF)) {
    const icon = await renderPng(dotSvg(size, { dotFillRatio: 0.7, fg: "#FFFFFF", transparent: true }), size);
    await writePng(join(ROOT, `android/app/src/main/res/drawable-${density}/ic_stat_notification.png`), icon);
  }

  // --- iOS AppIcon.appiconset — opaque (no alpha channel; App Store rejects
  // icons with transparency), so flatten onto the maroon background ---
  const IOS_SPECS = [
    { name: "icon-20@2x.png", size: 40 },
    { name: "icon-20@3x.png", size: 60 },
    { name: "icon-29@2x.png", size: 58 },
    { name: "icon-29@3x.png", size: 87 },
    { name: "icon-40@2x.png", size: 80 },
    { name: "icon-40@3x.png", size: 120 },
    { name: "icon-60@2x.png", size: 120 },
    { name: "icon-60@3x.png", size: 180 },
    { name: "icon-1024.png", size: 1024 },
  ];
  const iosDir = join(ROOT, "ios/FrinqMobile/Images.xcassets/AppIcon.appiconset");
  for (const { name, size } of IOS_SPECS) {
    const png = await renderPng(dotSvg(size), size, { flatten: MAROON });
    await writePng(join(iosDir, name), png);
  }

  // Wire the generated filenames into Contents.json (previously had no
  // "filename" keys at all — Xcode had nothing assigned). Matched by name
  // (e.g. "icon-20@2x.png" -> key "20@2x"), not by pixel size — several
  // distinct icon slots share the same pixel size (40pt@3x and 60pt@2x are
  // both 120px) and a size-only reverse lookup would silently pick the
  // wrong slot's filename for one of them.
  const contentsPath = join(iosDir, "Contents.json");
  const contents = JSON.parse(readFileSync(contentsPath, "utf8"));
  const byNameKey = new Map(
    IOS_SPECS.filter((s) => s.name !== "icon-1024.png").map((s) => [s.name.replace(/^icon-|\.png$/g, ""), s.name]),
  );
  for (const img of contents.images) {
    if (img.idiom === "ios-marketing") {
      img.filename = "icon-1024.png";
    } else {
      const sizePt = img.size.split("x")[0];
      img.filename = byNameKey.get(`${sizePt}@${img.scale}`);
    }
  }
  writeFileSync(contentsPath, JSON.stringify(contents, null, 2) + "\n");
  console.log("updated", contentsPath.slice(ROOT.length + 1), "with filenames");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
