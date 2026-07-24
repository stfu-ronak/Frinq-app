import { RefObject } from 'react';
import { releaseCapture, ViewShotRef } from 'react-native-view-shot';
import Share from 'react-native-share';

export type ShareResult = { status: 'shared' | 'cancelled' | 'error' };

/** Captures the (already-mounted, off-screen) share-mode VibeCard via its
 *  ViewShot ref and opens the native share sheet with the resulting PNG.
 *  Falls back to a text-only share if capture fails for any reason (missing
 *  view, native capture error) — sharing your archetype should never be
 *  fully blocked by an image-pipeline failure. Always deletes the temp
 *  capture file afterward, whether shared, cancelled, or errored. */
export async function shareVibeCard(
  cardRef: RefObject<ViewShotRef | null>,
  archetype: string,
  shareQuote?: string | null,
): Promise<ShareResult> {
  let uri: string | null = null;
  try {
    uri = (await cardRef.current?.capture?.()) ?? null;
  } catch {
    uri = null;
  }

  try {
    const options = uri
      ? { url: uri, type: 'image/png', title: `My Frinq Vibe: ${archetype}`, failOnCancel: false }
      : { message: shareQuote || `I'm a ${archetype} on Frinq.`, title: `My Frinq Vibe: ${archetype}`, failOnCancel: false };
    const result = await Share.open(options);
    return { status: result.success ? 'shared' : 'cancelled' };
  } catch {
    return { status: 'error' };
  } finally {
    if (uri) releaseCapture(uri);
  }
}
