import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "../components/ui/modal";

describe("Modal", () => {
  it("renders_nothing_when_closed", () => {
    render(
      <Modal open={false} title="Credit ledger" onClose={vi.fn()}>
        body
      </Modal>,
    );
    expect(screen.queryByText("Credit ledger")).not.toBeInTheDocument();
  });

  it("renders_the_title_and_body_as_a_dialog_when_open", () => {
    render(
      <Modal open title="Credit ledger" onClose={vi.fn()}>
        <p>body content</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Credit ledger")).toBeInTheDocument();
    expect(screen.getByText("body content")).toBeInTheDocument();
  });

  it("closes_on_the_close_button", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="T" onClose={onClose}>
        b
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes_on_escape", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="T" onClose={onClose}>
        b
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
