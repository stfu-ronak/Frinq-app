import React, { useState } from 'react';
import { Dialog } from '../../../design/components/Dialog';
import { ApiClient } from '../../../services/api/apiClient';
import {
  markPushOptInPromptShown,
  registerCurrentToken,
  requestPushPermission,
  setPushEnabled,
} from '../../../services/push/pushService';

type Props = {
  visible: boolean;
  apiClient: ApiClient;
  onDone: () => void;
};

/** Shown once, the first time a user reaches the community screen — never on
 *  app launch. OS permission is requested only after the explicit "enable"
 *  tap here, per Task 39's "ask only after community value" requirement. */
export function PushOptInPrompt({ visible, apiClient, onDone }: Props) {
  const [busy, setBusy] = useState(false);

  async function enable() {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await requestPushPermission();
      if (outcome === 'granted') {
        await registerCurrentToken(apiClient);
        await setPushEnabled(apiClient, true);
      }
    } catch {
      // Best-effort — the user can still enable later from Settings.
    } finally {
      await markPushOptInPromptShown();
      setBusy(false);
      onDone();
    }
  }

  async function dismiss() {
    await markPushOptInPromptShown();
    onDone();
  }

  return (
    <Dialog
      visible={visible}
      title="stay in the loop?"
      message="turn on notifications to know when there's new activity in your frinq squad."
      onRequestClose={dismiss}
      cancel={{ label: 'not now', onPress: dismiss }}
      confirm={{ label: busy ? 'enabling…' : 'enable notifications', onPress: enable }}
    />
  );
}
