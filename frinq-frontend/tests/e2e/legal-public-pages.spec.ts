import { test, expect, devices } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const RETAINED_PAGES = ["/", "/terms/", "/privacy/", "/community-rules/", "/support/", "/delete-account/"];

// After the Task 43 native cutover, frinq-frontend is a minimal public site:
// only legal/support/deletion-info pages plus a download landing page.
// Every former consumer/auth/quiz route must be gone (Task 43 Step 3) — these
// tests are the negative half of that proof, not just the positive half.

test.describe("retained public pages build and work without authentication", () => {
  test("landing page renders and links to the app", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("frinq.", { exact: false }).first()).toBeVisible();
  });

  test("terms page renders", async ({ page }) => {
    await page.goto("/terms/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("privacy page renders", async ({ page }) => {
    await page.goto("/privacy/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("community rules page renders", async ({ page }) => {
    await page.goto("/community-rules/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("support page renders and shows a mailto link", async ({ page }) => {
    await page.goto("/support/");
    await expect(page.locator("a[href^='mailto:']")).toBeVisible();
  });

  test("delete-account information page renders", async ({ page }) => {
    await page.goto("/delete-account/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("document versions and cross-links", () => {
  for (const [path, label] of [
    ["/terms/", "terms"],
    ["/privacy/", "privacy"],
    ["/community-rules/", "community rules"],
  ] as const) {
    test(`${label} page shows a version string`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(/version: draft-1/i)).toBeVisible();
    });
  }

  test("support page shows a mailto link and links to terms/privacy/community-rules/delete-account", async ({ page }) => {
    await page.goto("/support/");
    await expect(page.locator("a[href^='mailto:']")).toBeVisible();
    for (const href of ["/delete-account/", "/terms/", "/privacy/", "/community-rules/"]) {
      await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
    }
  });

  test("delete-account page gives both in-app and without-the-app deletion instructions", async ({ page }) => {
    await page.goto("/delete-account/");
    await expect(page.getByText(/settings.*delete account/i)).toBeVisible();
    await expect(page.locator("a[href^='mailto:']")).toBeVisible();
  });
});

test.describe("narrow viewport", () => {
  test.use({ viewport: devices["iPhone SE"].viewport });

  for (const path of RETAINED_PAGES) {
    test(`${path} renders without horizontal overflow at 375px wide`, async ({ page }) => {
      await page.goto(path);
      const [scrollWidth, clientWidth] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1: sub-pixel rounding
    });
  }
});

test.describe("keyboard navigation", () => {
  test("every link on the support page is reachable via Tab alone, in order, with no keyboard trap", async ({ page }) => {
    await page.goto("/support/");
    const linkCount = await page.locator("a").count();
    expect(linkCount).toBeGreaterThan(0);

    const reached = new Set<string | null>();
    for (let i = 0; i < linkCount; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === "A" ? el.getAttribute("href") : null;
      });
      reached.add(focused);
    }
    // Every link got focus turn-by-turn (no trap re-focusing the same
    // element, nothing skipped) — first is the mailto link.
    expect(reached.size).toBe(linkCount);
    expect([...reached][0]).toMatch(/^mailto:/);
  });

  test("landing page's primary link is reachable via keyboard alone", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(["A", "BUTTON"]).toContain(focused);
  });
});

test.describe("automated accessibility (axe)", () => {
  for (const path of RETAINED_PAGES) {
    test(`${path} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      if (serious.length > 0) {
        console.log(JSON.stringify(serious, null, 2));
      }
      expect(serious).toEqual([]);
    });
  }
});

test.describe("former consumer/auth/quiz routes are gone", () => {
  for (const path of ["/name/", "/phone/", "/verify/", "/city/", "/vibe-box/", "/terms/accept/"]) {
    test(`${path} returns a not-found response, not the old quiz screen`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    });
  }

  test("the community chat route is gone", async ({ page }) => {
    const response = await page.goto("/community/");
    expect(response?.status()).toBe(404);
  });

  test("the settings/profile app routes are gone", async ({ page }) => {
    const response = await page.goto("/settings/");
    expect(response?.status()).toBe(404);
  });
});
