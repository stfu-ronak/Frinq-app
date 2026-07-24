import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import { AppErrorBoundary } from './AppErrorBoundary';
import { setAnalyticsConsent } from '../services/telemetry/analytics';
import { SessionProvider } from '../services/session/sessionContext';
import { getEncryptedStore } from '../storage/encryptedStorage';

const ANALYTICS_CONSENT_KEY = 'analytics_consent';

/** Analytics consent context. Off by default; toggled from Settings (Task 35).
 *  Setting it here is the single source that gates `track()`. Persisted (not
 *  just in-memory) via the same encrypted store used for quiz drafts — it's
 *  a non-secret preference, same category the design spec calls out for that
 *  store — so the choice survives app restart, matching the web's
 *  localStorage-backed persistence. */
type ConsentContext = { enabled: boolean; setEnabled: (v: boolean) => void };
const AnalyticsConsentCtx = createContext<ConsentContext>({ enabled: false, setEnabled: () => {} });
export const useAnalyticsConsent = () => useContext(AnalyticsConsentCtx);

export function AnalyticsConsentProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = await getEncryptedStore();
      const stored = store.getString(ANALYTICS_CONSENT_KEY) === '1';
      if (!cancelled && stored) {
        setEnabledState(true);
        setAnalyticsConsent(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ConsentContext>(
    () => ({
      enabled,
      setEnabled: (v: boolean) => {
        setEnabledState(v);
        setAnalyticsConsent(v);
        getEncryptedStore().then((store) => store.set(ANALYTICS_CONSENT_KEY, v ? '1' : '0'));
      },
    }),
    [enabled],
  );
  return <AnalyticsConsentCtx.Provider value={value}>{children}</AnalyticsConsentCtx.Provider>;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, gcTime: 5 * 60_000 },
    },
  });
}

/** The single composition root. Order: gesture root -> safe area -> error
 *  boundary -> query -> session -> analytics consent -> navigation container.
 *  Exactly one NavigationContainer; never nested. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <SessionProvider>
              <AnalyticsConsentProvider>
                <NavigationContainer>{children}</NavigationContainer>
              </AnalyticsConsentProvider>
            </SessionProvider>
          </QueryClientProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
