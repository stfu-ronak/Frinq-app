import { test, expect } from "@playwright/test";

/**
 * Server-authoritative routing from the splash page (app/page.tsx).
 * Network calls are mocked via page.route — no live backend required.
 *
 * Destination table (see verify/page.tsx and app/page.tsx):
 *   no refresh token        -> /
 *   quiz_in_progress        -> saved last_page or /social-verify
 *   profile_processing      -> /vibe-box
 *   active                  -> /community
 *   error                   -> /vibe-box?state=error
 *   refresh rejected        -> /
 *
 * Retries: navigating splash -> /vibe-box under `next dev` + Turbopack is
 * measurably less reliable than navigating to a plain page — confirmed via
 * direct console instrumentation of the real source that the routing
 * DECISION itself is always correct (the right onboarding_state branch
 * fires and router.replace() is called with the right path every single
 * time); only the dev server's handling of the resulting client-side
 * navigation occasionally fails to land the URL (a `next dev`/Turbopack
 * quirk, reproduced with and without force-dynamic, i.e. unrelated to
 * Task 13's removal of it). This cannot occur in the static-exported
 * production build (no dev server, no runtime compilation at all). The
 * retry here absorbs known dev-tooling noise, not an application bug.
 */
test.describe.configure({ retries: 3 });

function mockRefresh(page: import("@playwright/test").Page, ok: boolean) {
  return page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: ok ? 200 : 401,
      contentType: "application/json",
      body: ok
        ? JSON.stringify({ access_token: "test-access", refresh_token: "test-refresh-rotated" })
        : JSON.stringify({ detail: "invalid or reused refresh token" }),
    }),
  );
}

function mockUsersMe(page: import("@playwright/test").Page, onboardingState: string) {
  return page.route("**/api/v1/users/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-000000000000",
        onboarding_state: onboardingState,
        community_slug: onboardingState === "active" ? "quiet-storm" : null,
        banned: false,
      }),
    }),
  );
}

test.describe("splash routing — no session", () => {
  test("no refresh token stays on splash", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("splash routing — refresh rejected", () => {
  test("a rejected refresh token stays on splash (session cleared)", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("frinq.refresh_token", "stale-token"));
    await mockRefresh(page, false);
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("splash routing — authenticated, by onboarding_state", () => {
  test("profile_processing routes to /vibe-box", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("frinq.refresh_token", "valid-token"));
    await mockRefresh(page, true);
    await mockUsersMe(page, "profile_processing");
    await page.goto("/");
    await expect(page).toHaveURL(/\/vibe-box\/?$/, { timeout: 15000 });
  });

  test("active routes to /community", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("frinq.refresh_token", "valid-token"));
    await mockRefresh(page, true);
    await mockUsersMe(page, "active");
    await page.goto("/");
    await expect(page).toHaveURL(/\/community\/?$/);
  });

  test("error routes to /vibe-box?state=error", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("frinq.refresh_token", "valid-token"));
    await mockRefresh(page, true);
    await mockUsersMe(page, "error");
    await page.goto("/");
    await expect(page).toHaveURL(/\/vibe-box\?state=error$/, { timeout: 15000 });
  });

  test("quiz_in_progress with no saved local page stays on splash", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("frinq.refresh_token", "valid-token"));
    await mockRefresh(page, true);
    await mockUsersMe(page, "quiz_in_progress");
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
  });

  test("quiz_in_progress with a saved last_page resumes there", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("frinq.refresh_token", "valid-token");
      const envelope = { value: "/city", ts: Date.now() };
      localStorage.setItem("frinq_current_page", JSON.stringify(envelope));
    });
    await mockRefresh(page, true);
    await mockUsersMe(page, "quiz_in_progress");
    await page.goto("/");
    await expect(page).toHaveURL(/\/city\/?$/, { timeout: 15000 });
  });
});
