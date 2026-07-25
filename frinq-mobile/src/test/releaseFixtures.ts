import React, { useEffect } from 'react';
import { render } from '@testing-library/react-native';
import { BootController } from '../app/App';
import { AppProviders } from '../app/AppProviders';
import { useSession } from '../services/session/sessionContext';
import { SessionCoordinator } from '../services/session/SessionCoordinator';
import { HttpResponse, HttpTransport } from '../services/api/apiClient';

/** Must match secureCredentials.ts's private REFRESH_TOKEN_SERVICE constant —
 *  there is no exported way to reference it directly. */
export const REFRESH_TOKEN_KEYCHAIN_SERVICE = 'in.frinq.app.refreshToken';

export function jsonResponse(status: number, body: unknown = {}): HttpResponse {
  return {
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

export type RouteMap = Record<string, () => HttpResponse | Promise<HttpResponse>>;

/** A minimal routed fake transport for full boot-journey tests: maps request
 *  URLs (matched by suffix) to canned responses, so the real SessionCoordinator
 *  + real apiClient + real BootController/routeForUser all run unmodified
 *  against it — only the network leaf is faked. Unmatched URLs 404 loudly
 *  rather than hanging, so a missing route fails fast instead of timing out. */
export function routedTransport(routes: RouteMap): HttpTransport {
  return async (url: string) => {
    for (const [suffix, respond] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return respond();
    }
    return jsonResponse(404, { detail: `releaseFixtures: no fake route for ${url}` });
  };
}

function Probe({ onReady }: { onReady: (coordinator: SessionCoordinator) => void }) {
  const { coordinator } = useSession();
  useEffect(() => {
    onReady(coordinator as SessionCoordinator);
  }, [coordinator, onReady]);
  return null;
}

/** Renders the real App composition root (minus the top-level App() wrapper's
 *  own effects, which only bind global network/lifecycle listeners already
 *  covered elsewhere) and hands back the live SessionCoordinator instance, so
 *  a test can drive real auth-state transitions (e.g. the exact
 *  coordinator.clear() account deletion performs) the same way production
 *  code does, without reaching into React internals or re-mocking BootController's
 *  own resolver. */
export function renderBootJourney() {
  let coordinator!: SessionCoordinator;
  const utils = render(
    React.createElement(
      AppProviders,
      null,
      React.createElement(Probe, { onReady: (c: SessionCoordinator) => { coordinator = c; } }),
      React.createElement(BootController, null),
    ),
  );
  return { ...utils, getCoordinator: () => coordinator };
}
