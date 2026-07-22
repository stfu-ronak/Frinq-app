import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}));

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: {
    setItem: vi.fn(async () => {}),
    getItem: vi.fn(async () => null),
    removeItem: vi.fn(async () => {}),
  },
}));

import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import {
  getAccessToken,
  saveRefreshToken,
  setAccessToken,
  restoreSession,
} from "@/app/lib/session";
import { apiFetch } from "@/app/lib/api";

const isNative = vi.mocked(Capacitor.isNativePlatform);
const secureSet = vi.mocked(SecureStorage.setItem);
const secureGet = vi.mocked(SecureStorage.getItem);
const secureRemove = vi.mocked(SecureStorage.removeItem);

beforeEach(() => {
  sessionStorage.clear();
  setAccessToken(null);
  isNative.mockReset().mockReturnValue(false);
  secureSet.mockReset().mockResolvedValue(undefined);
  secureGet.mockReset().mockResolvedValue(null);
  secureRemove.mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session storage", () => {
  it("native path stores only the refresh token in SecurePreferences, not sessionStorage", async () => {
    isNative.mockReturnValue(true);
    await saveRefreshToken("refresh-abc");

    expect(secureSet).toHaveBeenCalledWith("frinq.refresh_token", "refresh-abc");
    expect(sessionStorage.getItem("frinq.refresh_token")).toBeNull();
  });

  it("web path stores the refresh token in sessionStorage, not SecurePreferences", async () => {
    isNative.mockReturnValue(false);
    await saveRefreshToken("refresh-xyz");

    expect(sessionStorage.getItem("frinq.refresh_token")).toBe("refresh-xyz");
    expect(secureSet).not.toHaveBeenCalled();
  });

  it("access token exists only in module memory, never in sessionStorage or SecurePreferences", async () => {
    setAccessToken("access-123");
    expect(getAccessToken()).toBe("access-123");

    expect(sessionStorage.length).toBe(0);
    expect(secureSet).not.toHaveBeenCalled();
  });

  it("refresh failure clears all session state", async () => {
    isNative.mockReturnValue(false);
    sessionStorage.setItem("frinq.refresh_token", "stale-token");
    setAccessToken("stale-access");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    const state = await restoreSession();

    expect(state.authenticated).toBe(false);
    expect(sessionStorage.getItem("frinq.refresh_token")).toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});

describe("apiFetch", () => {
  it("a 401 triggers exactly one refresh and one request retry", async () => {
    setAccessToken("expired-access");
    sessionStorage.setItem("frinq.refresh_token", "valid-refresh");

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/v1/auth/refresh")) {
          calls.push("refresh");
          return new Response(
            JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
            { status: 200 },
          );
        }
        calls.push("resource");
        // First resource call fails with 401, retry (after refresh) succeeds.
        const isFirst = calls.filter((c) => c === "resource").length === 1;
        return new Response(JSON.stringify({ ok: true }), { status: isFirst ? 401 : 200 });
      }),
    );

    const response = await apiFetch("/api/v1/users/me");

    expect(response.status).toBe(200);
    expect(calls).toEqual(["resource", "refresh", "resource"]);
    expect(getAccessToken()).toBe("new-access");
  });

  it("concurrent 401 responses share one refresh promise", async () => {
    setAccessToken("expired-access");
    sessionStorage.setItem("frinq.refresh_token", "valid-refresh");

    let refreshCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/v1/auth/refresh")) {
          refreshCallCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return new Response(
            JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh" }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 401 });
      }),
    );

    // Both requests see a 401 on their first attempt and race to refresh.
    await Promise.all([apiFetch("/api/v1/a"), apiFetch("/api/v1/b")]);

    expect(refreshCallCount).toBe(1);
  });

  it("does not retry a 403", async () => {
    setAccessToken("some-access");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );

    const response = await apiFetch("/api/v1/quiz/submit");
    expect(response.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
