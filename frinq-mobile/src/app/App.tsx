import React, { useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppProviders } from './AppProviders';
import { RootNavigator } from '../navigation/RootNavigator';
import { BootState, routeForUser } from './boot/bootMachine';
import { bindAppLifecycle } from '../services/lifecycle/appLifecycle';
import { bindNetworkToQuery } from '../services/network/networkState';
import { useSession } from '../services/session/sessionContext';
import { NetworkError } from '../services/api/apiError';
import { UserResponse, LegalCurrent } from '../services/api/contracts';

export type BootResolver = () => Promise<BootState>;

function BootController({ resolveBoot }: { resolveBoot?: BootResolver }) {
  const { coordinator, apiClient, authenticated } = useSession();
  const [state, setState] = useState<BootState>('checking');
  const stateRef = useRef<BootState>(state);
  stateRef.current = state;

  const resolver = useMemo<BootResolver>(() => {
    if (resolveBoot) return resolveBoot;
    return async () => {
      const { authenticated: restored, offline } = await coordinator.restoreSession();
      // Can't confirm the session and there's no connectivity, but a
      // credential is still stored → offline retry screen, never login.
      if (!restored) return offline ? 'offline' : 'authRequired';
      try {
        const [user, legal] = await Promise.all([
          apiClient.request<UserResponse>({ path: '/api/v1/users/me' }),
          apiClient.request<LegalCurrent>({ path: '/api/v1/legal/current', auth: false }),
        ]);
        return routeForUser(user, legal);
      } catch (err) {
        // Session restored fine but the profile/legal fetch hit the network —
        // still offline, not a hard error and not logged out.
        if (err instanceof NetworkError) return 'offline';
        throw err;
      }
    };
  }, [resolveBoot, coordinator, apiClient]);

  function runResolve() {
    setState('checking');
    resolver()
      .then(setState)
      .catch(() => setState('error'));
  }

  // Re-runs on mount AND whenever auth state flips (OTP verify success,
  // logout) — server state stays the single source of truth for routing,
  // never a client-side "onboarding complete" flag.
  useEffect(() => {
    let cancelled = false;
    setState('checking');
    resolver()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [resolver, authenticated]);

  // Auto-resume when connectivity returns while parked on the offline boot
  // screen — the "resilient online / automatic resume" the design spec calls
  // for, so a returning user who launched offline doesn't have to tap retry.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((netState) => {
      const online = netState.isConnected !== false && netState.isInternetReachable !== false;
      if (online && stateRef.current === 'offline') runResolve();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolver]);

  // A returning user re-accepting stale legal terms doesn't flip
  // `authenticated` (they were already signed in) — re-resolve explicitly.
  const reresolve = runResolve;

  return (
    <RootNavigator
      state={state}
      onLegalAccepted={reresolve}
      onQuizComplete={reresolve}
      onProcessingComplete={reresolve}
      onOfflineRetry={reresolve}
    />
  );
}

export function App({ resolveBoot }: { resolveBoot?: BootResolver }) {
  useEffect(() => {
    const unbindNet = bindNetworkToQuery();
    const unbindLifecycle = bindAppLifecycle();
    return () => {
      unbindNet();
      unbindLifecycle();
    };
  }, []);

  return (
    <AppProviders>
      <BootController resolveBoot={resolveBoot} />
    </AppProviders>
  );
}

export default App;
