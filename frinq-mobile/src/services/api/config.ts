import { Platform } from 'react-native';

/**
 * API base URL. Local dev only for now — production identity/config (real
 * api.frinq.in origin, per-environment overrides) lands in Task 41. Android
 * emulators can't reach the host's `localhost` directly; `10.0.2.2` is the
 * documented emulator alias for the host loopback. iOS simulator shares the
 * host network namespace, so `localhost` works as-is. A physical device needs
 * the host's LAN IP — not handled yet, deliberately: physical-device local dev
 * isn't a Task 30 requirement.
 */
const DEV_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export const API_BASE_URL = __DEV__ ? DEV_BASE_URL : 'https://api.frinq.in';

/** The public marketing/legal-pages site (frinq-frontend). Always the real
 *  deployed origin, even in dev builds — "read the full document online"
 *  opens the actual internet-facing site in the system browser, not a local
 *  dev server; there's nothing to develop against locally for that action.
 *  Placeholder until Task 41 finalizes per-environment identity, same as
 *  API_BASE_URL's prod value above. */
export const WEB_BASE_URL = 'https://frinq.in';
