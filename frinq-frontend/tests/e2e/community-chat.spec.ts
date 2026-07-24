import { test, expect } from "@playwright/test";

/**
 * Real-browser smoke check for the community chat screen (Task 21).
 * Network calls (REST + WebSocket) are fully mocked via page.route /
 * page.routeWebSocket — no live backend or Redis required. This is the
 * "actually look at it in a browser" verification step the plan's Task 21
 * Step 6 asks for, not just unit tests of the state machine.
 */

const USER_ID = "00000000-0000-0000-0000-000000000001";

function mockRefresh(page: import("@playwright/test").Page) {
  return page.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "test-access", refresh_token: "test-refresh-rotated" }),
    }),
  );
}

function mockUsersMe(page: import("@playwright/test").Page) {
  return page.route("**/api/v1/users/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        display_name: "Test User",
        onboarding_state: "active",
        community_slug: "quiet-storm",
        banned: false,
      }),
    }),
  );
}

function mockHistory(page: import("@playwright/test").Page) {
  return page.route("**/api/v1/community/messages*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [{
          id: 1, client_message_id: "11111111-1111-1111-1111-111111111111",
          body: "hey everyone", created_at: "2026-01-01T10:00:00Z",
          author: { id: "other-user", display_name: "Someone Else" },
        }],
        next_cursor: null,
      }),
    }),
  );
}

function mockTicket(page: import("@playwright/test").Page) {
  return page.route("**/api/v1/community/ws-ticket", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ticket: "test-ticket", expires_in: 60 }),
    }),
  );
}

test("community chat renders history, connects, and sends a message", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("frinq.refresh_token", "valid-token"));
  await mockRefresh(page);
  await mockUsersMe(page);
  await mockHistory(page);
  await mockTicket(page);

  let lastSentFrame: string | null = null;
  await page.routeWebSocket("**/api/v1/ws/community*", (ws) => {
    ws.onMessage((message) => {
      lastSentFrame = String(message);
      ws.send(JSON.stringify({ type: "pong" }));
    });
    ws.send(JSON.stringify({ type: "ready", community_slug: "quiet-storm", server_time: "2026-01-01T10:00:00Z" }));
  });

  await page.goto("/community/");

  // Header shows the humanized community name and (briefly) connects.
  await expect(page.getByRole("heading", { name: "Quiet Storm" })).toBeVisible({ timeout: 10000 });

  // History message from the mocked REST call renders.
  await expect(page.getByText("hey everyone")).toBeVisible();

  // Composer is enabled once the WS reports "connected" (no visible banner).
  const composer = page.getByRole("textbox", { name: "message" });
  await expect(composer).toBeEnabled({ timeout: 10000 });

  await composer.fill("hello from playwright");
  await page.getByRole("button", { name: "send message" }).click();

  // Optimistic bubble shows immediately, before any server confirmation.
  await expect(page.getByText("hello from playwright")).toBeVisible();

  await expect.poll(() => lastSentFrame).not.toBeNull();
  const frame = JSON.parse(lastSentFrame!);
  expect(frame.type).toBe("message.send");
  expect(frame.body).toBe("hello from playwright");
  expect(typeof frame.client_message_id).toBe("string");
});
