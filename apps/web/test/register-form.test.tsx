import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterForm } from "../components/register-form";
import { ApiError } from "../lib/api";
import type { ApiClient } from "../lib/api";

const apiWith = (overrides: Partial<ApiClient>): ApiClient => ({
  register: vi.fn(),
  getInvestor: vi.fn(),
  submitKyc: vi.fn(),
  ...overrides,
});

describe("RegisterForm", () => {
  it("renders_the_english_labels_by_default", () => {
    render(<RegisterForm locale="en" api={apiWith({})} onRegistered={vi.fn()} />);
    expect(screen.getByText("Investor Registration")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("registers_and_reports_the_new_investor_id", async () => {
    const register = vi.fn().mockResolvedValue({ investorId: "inv-42" });
    const onRegistered = vi.fn();
    render(<RegisterForm locale="en" api={apiWith({ register })} onRegistered={onRegistered} />);

    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => {
      expect(onRegistered).toHaveBeenCalledWith("inv-42");
    });
    expect(register).toHaveBeenCalledWith("a@example.com");
  });

  it("shows_the_api_error_message_on_failure", async () => {
    const register = vi.fn().mockRejectedValue(new ApiError(409, "already registered"));
    render(<RegisterForm locale="en" api={apiWith({ register })} onRegistered={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already registered");
  });
});
