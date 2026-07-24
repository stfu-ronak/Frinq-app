import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/app/lib/api";
import MessageBubble, { type DisplayMessage } from "./MessageBubble";

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

function otherMessage(overrides: Partial<DisplayMessage> = {}): DisplayMessage {
  return {
    clientMessageId: "cmid-1",
    id: 42,
    body: "hello there",
    authorId: "other-user",
    authorDisplayName: "Someone Else",
    createdAt: "2026-01-01T10:00:00Z",
    status: "sent",
    ...overrides,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("message actions visibility", () => {
  it("another user's message exposes a message-actions menu button", () => {
    render(<MessageBubble message={otherMessage()} isOwn={false} onBlocked={vi.fn()} />);
    expect(screen.getByRole("button", { name: "message actions" })).toBeInTheDocument();
  });

  it("the user's own message never exposes a message-actions menu", () => {
    render(<MessageBubble message={otherMessage({ authorId: "me" })} isOwn onBlocked={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "message actions" })).not.toBeInTheDocument();
  });
});

describe("report flow", () => {
  it("report reasons are keyboard accessible and submission is idempotent", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ report_id: "r1", status: "open" }) });

    render(<MessageBubble message={otherMessage()} isOwn={false} onBlocked={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "message actions" }));
    await user.click(screen.getByRole("menuitem", { name: "report" }));

    const dialog = screen.getByRole("dialog", { name: "report message" });
    // Tab from body into the radio group and select via keyboard alone.
    const spamRadio = within(dialog).getByRole("radio", { name: "spam" });
    spamRadio.focus();
    await user.keyboard(" "); // space selects a focused radio

    const submit = within(dialog).getByRole("button", { name: "submit" });
    expect(submit).toBeEnabled();

    // Rapid double-activation must only ever fire one request — the
    // component's own `submitting` guard makes the endpoint call
    // idempotent-in-practice from the client side (the server is also
    // idempotent on repeat reports, per Phase 5, but this covers the UI
    // half of that guarantee).
    await user.click(submit);
    await user.click(submit);

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/messages/42/report",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("block flow", () => {
  it("block confirmation explains the immediate effect before confirming", async () => {
    const user = userEvent.setup();
    render(<MessageBubble message={otherMessage()} isOwn={false} onBlocked={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "message actions" }));
    await user.click(screen.getByRole("menuitem", { name: "block" }));

    const dialog = screen.getByRole("dialog", { name: "block user" });
    expect(within(dialog).getByText(/takes effect immediately/i)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled(); // no request until confirmed
  });

  it("confirming block calls the block endpoint and notifies the parent", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ blocked: true }) });
    const onBlocked = vi.fn();

    render(<MessageBubble message={otherMessage()} isOwn={false} onBlocked={onBlocked} />);

    await user.click(screen.getByRole("button", { name: "message actions" }));
    await user.click(screen.getByRole("menuitem", { name: "block" }));
    await user.click(screen.getByRole("button", { name: "block" }));

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/users/other-user/block", expect.objectContaining({ method: "POST" }));
    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalledWith("other-user"));
  });
});
