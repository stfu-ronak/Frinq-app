import { test, expect } from "@playwright/test";

// Smoke navigation across the quiz funnel. Visits pages directly and
// asserts they render their expected content without crashing. Does not
// exercise backend-dependent flows (OTP send/verify, quiz submit, voice
// upload) — those need a live API and are out of scope for a smoke pass.

test.describe("quiz smoke navigation", () => {
  test("splash renders hero and begin button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "begin" })).toBeVisible();
    await expect(page.getByText("frinq.")).toBeVisible();
  });

  test("name page accepts input and advances to phone", async ({ page }) => {
    // client-only: setQuizState + router.push, no backend call.
    // Asserts on rendered content, not the URL bar — UrlMask intentionally
    // rewrites every quiz route's visible address back to "/".
    await page.goto("/name");
    await page.getByPlaceholder("your name...").fill("Test User");
    await page.getByRole("button", { name: "next", exact: true }).click();
    await expect(page.getByText("what's your whatsapp number?")).toBeVisible();
  });

  test("phone page renders number entry", async ({ page }) => {
    await page.goto("/phone");
    await expect(page.getByText("+91")).toBeVisible();
    await expect(page.getByPlaceholder("98765 43210")).toBeVisible();
  });

  test("verify page renders OTP digit entry", async ({ page }) => {
    await page.goto("/verify");
    const digitInputs = page.locator("input[inputmode='numeric'][maxlength='6']");
    await expect(digitInputs.first()).toBeVisible();
  });

  test("a single-pick choice page renders its question and options", async ({ page }) => {
    await page.goto("/connection-mode");
    await expect(
      page.getByText("you're most likely to connect with someone when...")
    ).toBeVisible();
    await expect(page.getByText("we're laughing a lot")).toBeVisible();
  });

  test("story page offers a type-instead fallback to voice", async ({ page }) => {
    await page.goto("/story");
    await expect(page.getByText("or type", { exact: true })).toBeVisible();
    await expect(
      page.getByPlaceholder("we were both waiting for the same...")
    ).toBeVisible();
  });

  test("vibe-box preview route renders without crashing", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));
    const response = await page.goto("/vibe-box?preview=smoke-test-nonexistent-id");
    expect(response?.ok()).toBeTruthy();
    // Let the resuming-fetch fallback (fetch fails against a nonexistent
    // id, falls back to polling) settle before checking for uncaught
    // render errors.
    await page.waitForTimeout(1000);
    expect(pageErrors).toEqual([]);
  });
});
