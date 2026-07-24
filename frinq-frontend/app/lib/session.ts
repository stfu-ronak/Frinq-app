"use client";

/**
 * Session token storage. Refresh token only ever touches durable storage —
 * SecurePreferences (native Keychain/Keystore) or sessionStorage (web),
 * never localStorage. The access token lives in module memory only and is
 * lost on reload by design (restoreSession() re-derives it from the
 * refresh token, which is the whole point of a short-lived access token).
 */

import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const REFRESH_TOKEN_KEY = "frinq.refresh_token";

export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}${path}`;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await SecureStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  }
}

export async function loadRefreshToken(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    return await SecureStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await SecureStorage.removeItem(REFRESH_TOKEN_KEY);
  } else {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  setAccessToken(null);
}

export interface SessionState {
  authenticated: boolean;
}

const PENDING_LEGAL_KEY = "frinq.pending_legal_acceptance";

export interface PendingLegalAcceptance {
  termsVersion: string;
  privacyVersion: string;
  locale: string;
}

/** Set on /terms/accept BEFORE authentication exists — sessionStorage
 * only, cleared once POSTed to /api/v1/legal/accept right after OTP
 * creates the account. Never persisted anywhere more durable than that. */
export function savePendingLegalAcceptance(acceptance: PendingLegalAcceptance): void {
  sessionStorage.setItem(PENDING_LEGAL_KEY, JSON.stringify(acceptance));
}

export function loadPendingLegalAcceptance(): PendingLegalAcceptance | null {
  const raw = sessionStorage.getItem(PENDING_LEGAL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingLegalAcceptance;
  } catch {
    return null;
  }
}

export function clearPendingLegalAcceptance(): void {
  sessionStorage.removeItem(PENDING_LEGAL_KEY);
}

/**
 * Reads the stored refresh token (if any) and exchanges it for a fresh
 * access/refresh pair via POST /api/v1/auth/refresh. Does NOT fetch
 * onboarding_state/community_slug — callers that need account state make
 * their own GET /api/v1/users/me call afterward (see AccountGate).
 */
export async function restoreSession(): Promise<SessionState> {
  const refreshToken = await loadRefreshToken();
  if (!refreshToken) {
    return { authenticated: false };
  }

  try {
    const res = await fetch(apiUrl("/api/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await clearRefreshToken();
      return { authenticated: false };
    }
    const data = await res.json();
    setAccessToken(data.access_token);
    await saveRefreshToken(data.refresh_token);
    return { authenticated: true };
  } catch {
    // Network failure: don't clear the refresh token (it may still be
    // valid) — just report unauthenticated for this attempt.
    return { authenticated: false };
  }
}
