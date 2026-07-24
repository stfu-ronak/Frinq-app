import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/api", () => ({ apiFetch: vi.fn() }));

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { apiFetch } from "@/app/lib/api";
import EditProfilePage from "./page";

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockApiFetch.mockReset();
  replace.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

function mockMe(displayName: string | null) {
  mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/v1/users/me" && (!init || init.method === undefined)) {
      return { ok: true, json: async () => ({ display_name: displayName }) };
    }
    if (path === "/api/v1/users/me" && init?.method === "PATCH") {
      return { ok: true, json: async () => ({ display_name: JSON.parse(String(init.body)).display_name }) };
    }
    throw new Error(`unexpected call: ${path}`);
  });
}

describe("profile edit page", () => {
  it("loads the current name and shows a live character count", async () => {
    mockMe("Alice");
    render(<EditProfilePage />);
    const input = await screen.findByLabelText("display name");
    expect(input).toHaveValue("Alice");
    expect(screen.getByText("5/40")).toBeInTheDocument();
  });

  it("save is disabled until the name is actually changed (dirty-state gating)", async () => {
    mockMe("Alice");
    render(<EditProfilePage />);
    const saveButton = await screen.findByRole("button", { name: "save" });
    expect(saveButton).toBeDisabled();
  });

  it("saves the new name and navigates back only after server acceptance", async () => {
    const user = userEvent.setup();
    mockMe("Alice");
    render(<EditProfilePage />);
    const input = await screen.findByLabelText("display name");
    await user.clear(input);
    await user.type(input, "Bob");

    const saveButton = screen.getByRole("button", { name: "save" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/profile/"));
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/users/me",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ display_name: "Bob" }) }),
    );
  });

  it("maps a server rejection to a readable error and does not navigate away", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return { ok: false, status: 422, json: async () => ({ detail: [{ msg: "Value error, display_name_reserved_term" }] }) };
      }
      return { ok: true, json: async () => ({ display_name: "Alice" }) };
    });
    render(<EditProfilePage />);
    const input = await screen.findByLabelText("display name");
    await user.clear(input);
    await user.type(input, "admin");
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't available/i);
    expect(replace).not.toHaveBeenCalledWith("/profile/");
  });

  it("cancel asks for confirmation only when there are unsaved changes", async () => {
    const user = userEvent.setup();
    mockMe("Alice");
    render(<EditProfilePage />);
    const input = await screen.findByLabelText("display name");

    // Not dirty yet — cancel navigates straight back, no confirm dialog.
    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/profile/");

    replace.mockClear();
    await user.type(input, "x");
    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/profile/");
  });
});
