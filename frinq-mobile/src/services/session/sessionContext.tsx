import React, { createContext, useContext, useMemo, useState } from 'react';
import { SessionCoordinator } from './SessionCoordinator';
import { keychainCredentialStore } from '../../storage/secureCredentials';
import { createApiClient, ApiClient } from '../api/apiClient';
import { fetchTransport } from '../api/httpTransport';
import { API_BASE_URL } from '../api/config';

interface SessionContextValue {
  coordinator: SessionCoordinator;
  apiClient: ApiClient;
  /** Re-render key that flips whenever auth state changes, so consumers that
   *  need to react to login/logout (not just read the current token) can. */
  authenticated: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

/**
 * Owns the single SessionCoordinator + ApiClient for the whole app. Screens
 * never construct their own — always go through useSession().
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [coordinator] = useState(
    () =>
      new SessionCoordinator({
        baseUrl: API_BASE_URL,
        transport: fetchTransport,
        store: keychainCredentialStore,
        onAuthChange: setAuthenticated,
      }),
  );
  const [apiClient] = useState(() =>
    createApiClient({ baseUrl: API_BASE_URL, transport: fetchTransport, session: coordinator }),
  );

  const value = useMemo<SessionContextValue>(
    () => ({ coordinator, apiClient, authenticated }),
    [coordinator, apiClient, authenticated],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
