import React from 'react';
import { Placeholder } from '../../../navigation/placeholders';

/** Community chat lands in Tasks 37-38 (Phase 10). This is the tab's real
 *  screen component (not an inline placeholder) so MainTabs can wire a named
 *  screen the same way every other tab does. */
export function CommunityPlaceholderScreen() {
  return <Placeholder title="Community" note="Tasks 37-38" testID="screen-community" />;
}
