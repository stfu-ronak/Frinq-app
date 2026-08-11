/**
 * API base URL. Local dev only for now — production identity/config (real
 * api.frinq.in origin, per-environment overrides) lands in Task 41.
 *
 * Android (both emulator AND a real device over USB) reaches the dev
 * backend via `localhost:8000` — requires running
 * `adb reverse tcp:8000 tcp:8000` once per launch, which maps the device's
 * own localhost:8000 to the host machine's, over the USB/adb link. This
 * works identically for an emulator or a real device (adb reverse isn't
 * emulator-only), so one dev URL covers both — no `10.0.2.2` special-casing,
 * no LAN-IP/Wi-Fi requirement. iOS simulator shares the host network
 * namespace, so `localhost` already works there without any reverse mapping.
 */
const DEV_BASE_URL = 'http://localhost:8000';

/**
 * ── THE ONE LINE TO CHANGE BEFORE BUILDING AN APK ────────────────────────
 * A release build does NOT use DEV_BASE_URL (`__DEV__` is false), and it has
 * no adb reverse to lean on — the phone resolves this URL on its own network.
 * So for a build someone else installs, this must be a host their phone can
 * actually reach:
 *   - a deployed backend            https://api.frinq.in
 *   - a tunnel to your machine      https://<something>.trycloudflare.com
 *   - your LAN IP, same wifi only   http://192.168.31.24:8001
 * Plain http:// also needs usesCleartextTraffic — see android/app/src/main/
 * AndroidManifest.xml. Leaving this pointed at a host that doesn't exist is
 * why a release APK installs fine and then fails on the first request.
 */
const PROD_BASE_URL = 'https://frinq-testing-app-4av6b.ondigitalocean.app';

export const API_BASE_URL = __DEV__ ? DEV_BASE_URL : PROD_BASE_URL;

/** The public marketing/legal-pages site (frinq-frontend). Always the real
 *  deployed origin, even in dev builds — "read the full document online"
 *  opens the actual internet-facing site in the system browser, not a local
 *  dev server; there's nothing to develop against locally for that action.
 *  Placeholder until Task 41 finalizes per-environment identity, same as
 *  API_BASE_URL's prod value above. */
export const WEB_BASE_URL = 'https://frinq.in';

/** Sent as push_tokens.app_version (debugging/targeting only, never parsed
 *  by the client). Hand-kept in sync with package.json's version until a
 *  build-time injection exists — same "placeholder pending real tooling"
 *  status as the URLs above. */
export const APP_VERSION = '0.0.1';
