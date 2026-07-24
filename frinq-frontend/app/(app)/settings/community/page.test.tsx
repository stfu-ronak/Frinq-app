import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/app/lib/api";
import CommunitySettingsPage from "./page";

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("community mute preference", () => {
  it("loads the current muted state from the server on mount (survives reload)", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ archetype_slug: "quiet-storm", name: "Quiet Storm", description: "", muted: true, joined_at: "2026-01-01T00:00:00Z" }),
    });

    render(<CommunitySettingsPage />);

    const toggle = await screen.findByRole("switch", { name: "notify me about new messages" });
    // muted=true from the server means notifications are OFF.
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/community/me");
  });

  it("toggling calls PATCH /community/preferences with the new value", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/v1/community/me") {
        return { ok: true, json: async () => ({ muted: true }) };
      }
      if (path === "/api/v1/community/preferences") {
        return { ok: true, json: async () => JSON.parse(String(init?.body)) };
      }
      throw new Error(`unexpected path ${path}`);
    });

    render(<CommunitySettingsPage />);
    const toggle = await screen.findByRole("switch", { name: "notify me about new messages" });
    await user.click(toggle);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/community/preferences",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ muted: false }) }),
    );
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("reverts optimistic toggle if the server rejects the change", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/v1/community/me") return { ok: true, json: async () => ({ muted: true }) };
      return { ok: false, status: 500, json: async () => ({}) };
    });

    render(<CommunitySettingsPage />);
    const toggle = await screen.findByRole("switch", { name: "notify me about new messages" });
    await user.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't save/i);
    expect(toggle).toHaveAttribute("aria-checked", "false"); // reverted back to muted=true
  });
});
