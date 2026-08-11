import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { AppProviders } from './AppProviders';
import { FontWarmup } from './FontWarmup';
import { RootNavigator } from '../navigation/RootNavigator';
import { BootState, routeForUser } from './boot/bootMachine';
import { bindAppLifecycle } from '../services/lifecycle/appLifecycle';
import { bindNetworkToQuery } from '../services/network/networkState';
import { useSession } from '../services/session/sessionContext';
import { NetworkError } from '../services/api/apiError';
import { UserResponse, LegalCurrent } from '../services/api/contracts';

export type BootResolver = () => Promise<BootState>;

export function BootController({ resolveBoot }: { resolveBoot?: BootResolver }) {
  const { coordinator, apiClient, authenticated } = useSession();
  const queryClient = useQueryClient();
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
          // Shared query key with QuizNavigator's own /users/me fetch — within
          // the 30s staleTime, whichever runs second reuses this cached
          // result instead of hitting the network again.
          queryClient.fetchQuery({
            queryKey: ['currentUser'],
            queryFn: () => apiClient.request<UserResponse>({ path: '/api/v1/users/me' }),
          }),
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
  }, [resolveBoot, coordinator, apiClient, queryClient]);

  // Every resolve trigger (mount, auth flip, NetInfo auto-resume, nav
  // callbacks) routes through here. A monotonic id + mounted flag ensure only
  // the LATEST resolve wins: without this, two concurrent resolvers (e.g. a
  // nav callback fired near an auth flip) race to setState and the
  // later-settling, possibly stale one clobbers the correct route — and a
  // resolve completing after unmount writes into a dead component.
  const resolveIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Only the true first (cold-boot) resolve forces the 'checking'/splash
  // render. Every later re-resolve (OTP verify, legal accepted, quiz
  // complete, ...) keeps whatever screen is currently mounted visible while
  // it runs in the background, then jumps straight to the real destination —
  // instead of round-tripping through a cold-launch-styled splash screen on
  // every auth/state flip.
  const isInitialResolveRef = useRef(true);

  const runResolve = useCallback(() => {
    const id = ++resolveIdRef.current;
    if (isInitialResolveRef.current) setState('checking');
    resolver()
      .then((next) => {
        isInitialResolveRef.current = false;
        if (mountedRef.current && resolveIdRef.current === id) setState(next);
      })
      .catch(() => {
        isInitialResolveRef.current = false;
        if (mountedRef.current && resolveIdRef.current === id) setState('error');
      });
  }, [resolver]);

  // Re-runs on mount AND whenever auth state flips (OTP verify success,
  // logout) — server state stays the single source of truth for routing,
  // never a client-side "onboarding complete" flag.
  useEffect(() => {
    runResolve();
  }, [runResolve, authenticated]);

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
      <FontWarmup />
      <BootController resolveBoot={resolveBoot} />
    </AppProviders>
  );
}

export default App;
