import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasAnalyticsDecision,
  isAnalyticsEnabled,
  setAnalyticsEnabled,
  track,
} from "./analytics";

const mockFetch = vi.fn();

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
  localStorage.clear();
  sessionStorage.clear();
  mockFetch.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consent", () => {
  it("is off by default", () => {
    expect(isAnalyticsEnabled()).toBe(false);
    expect(hasAnalyticsDecision()).toBe(false);
  });

  it("stays off after an explicit opt-out", () => {
    setAnalyticsEnabled(false);
    expect(isAnalyticsEnabled()).toBe(false);
    expect(hasAnalyticsDecision()).toBe(true);
  });

  it("turns on only after an explicit opt-in", () => {
    setAnalyticsEnabled(true);
    expect(isAnalyticsEnabled()).toBe(true);
  });
});

describe("track", () => {
  it("never fires while consent is off (default)", () => {
    track("screen_view");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("stops immediately once consent is revoked", () => {
    setAnalyticsEnabled(true);
    track("screen_view");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    setAnalyticsEnabled(false);
    track("screen_view");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends only session_id/page/action — no free-form properties", async () => {
    setAnalyticsEnabled(true);
    track("community_opened");
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body).sort()).toEqual(["action", "page", "session_id"]);
    expect(body.action).toBe("community_opened");
  });

  it("is a no-op for an event outside the allowlist", () => {
    setAnalyticsEnabled(true);
    // @ts-expect-error deliberately outside the AnalyticsEvent union
    track("select_option");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
