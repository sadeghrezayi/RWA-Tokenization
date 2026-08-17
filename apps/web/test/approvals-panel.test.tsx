import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalsPanel } from "../components/admin/approvals-panel";
import type { ApprovalViewDto } from "../lib/api";
import { stubApi } from "./auth-panel.test";

const pending: ApprovalViewDto = {
  id: "apr-1",
  action: "ledger.credit",
  status: "pending",
  summary: "Credit 50000000000 ریال to investor inv-1",
  makerId: "officer-1",
  createdAt: "2026-07-25T10:00:00.000Z",
};

describe("ApprovalsPanel", () => {
  it("lists_pending_approvals", async () => {
    const listApprovals = vi.fn().mockResolvedValue([pending]);
    render(<ApprovalsPanel locale="en" api={stubApi({ listApprovals })} token="csrf" />);

    expect(await screen.findByText(/Credit 50000000000/)).toBeInTheDocument();
    expect(screen.getByText("officer-1")).toBeInTheDocument();
    expect(listApprovals).toHaveBeenCalledWith("csrf");
  });

  // A checker decides about money; "officer-1" tells them nothing about who
  // asked for it.
  it("names the maker who asked, falling back to the id when unresolved", async () => {
    const named = { ...pending, makerLabel: "treasury@platform.local" };
    render(
      <ApprovalsPanel
        locale="en"
        api={stubApi({ listApprovals: vi.fn().mockResolvedValue([named]) })}
        token="csrf"
      />,
    );

    expect(await screen.findByText("treasury@platform.local")).toBeInTheDocument();
    expect(screen.queryByText("officer-1")).toBeNull();
  });

  it("approves_a_request_and_refreshes", async () => {
    const listApprovals = vi.fn().mockResolvedValueOnce([pending]).mockResolvedValueOnce([]);
    const approveApproval = vi.fn().mockResolvedValue(undefined);
    render(
      <ApprovalsPanel locale="en" api={stubApi({ listApprovals, approveApproval })} token="csrf" />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(approveApproval).toHaveBeenCalledWith("csrf", "apr-1");
    });
    await waitFor(() => {
      expect(screen.queryByText(/Credit 50000000000/)).not.toBeInTheDocument();
    });
  });

  it("rejects_a_request_with_a_reason_from_the_modal", async () => {
    const listApprovals = vi.fn().mockResolvedValueOnce([pending]).mockResolvedValueOnce([]);
    const rejectApproval = vi.fn().mockResolvedValue(undefined);
    render(
      <ApprovalsPanel locale="en" api={stubApi({ listApprovals, rejectApproval })} token="csrf" />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText(/Rejection reason/), "insufficient evidence");
    await userEvent.click(dialog.getByRole("button", { name: "Confirm rejection" }));

    await waitFor(() => {
      expect(rejectApproval).toHaveBeenCalledWith("csrf", "apr-1", "insufficient evidence");
    });
  });
});
