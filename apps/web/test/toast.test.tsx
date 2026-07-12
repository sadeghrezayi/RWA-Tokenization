import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "../components/ui/toast";

const Trigger = () => {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.show("Saved successfully", "success");
      }}
    >
      go
    </button>
  );
};

describe("Toast", () => {
  it("shows_a_toast_when_triggered_via_the_hook", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    expect(screen.queryByText("Saved successfully")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "go" }));

    expect(await screen.findByText("Saved successfully")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
