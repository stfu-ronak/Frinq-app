import { AppState, AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';

/** Foreground/background transitions. Session/realtime/audio adapters subscribe
 *  so they can pause timers/motion, suspend realtime after a grace period, and
 *  stop the microphone when backgrounded, then revalidate on resume. */
export type AppPhase = 'active' | 'background';
type PhaseListener = (phase: AppPhase) => void;

const listeners = new Set<PhaseListener>();

export function onAppPhase(listener: PhaseListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toPhase(status: AppStateStatus): AppPhase {
  return status === 'active' ? 'active' : 'background';
}

/** Bind AppState to TanStack Query focus + the phase pub/sub. Returns an
 *  unsubscribe. Call once at app start. */
export function bindAppLifecycle(): () => void {
  const handle = (status: AppStateStatus) => {
    const phase = toPhase(status);
    focusManager.setFocused(phase === 'active');
    for (const l of listeners) l(phase);
  };
  const sub = AppState.addEventListener('change', handle);
  return () => sub.remove();
}
