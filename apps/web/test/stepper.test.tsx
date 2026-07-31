import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Stepper } from "../components/ui/stepper";

const steps = [
  { id: "profile", label: "Your details" },
  { id: "identity_evidence", label: "Identity document" },
  { id: "agreements", label: "Agreements" },
];

describe("Stepper", () => {
  it("shows every step with its position and label", () => {
    render(<Stepper steps={steps} current="profile" completed={[]} onSelect={vi.fn()} />);

    for (const step of steps) {
      expect(screen.getByRole("tab", { name: new RegExp(step.label) })).toBeTruthy();
    }
  });

  it("marks the current step for assistive technology, not just visually", () => {
    render(
      <Stepper
        steps={steps}
        current="identity_evidence"
        completed={["profile"]}
        onSelect={vi.fn()}
      />,
    );

    const current = screen.getByRole("tab", { name: /Identity document/ });
    expect(current.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Your details/ }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("announces which steps are already done", () => {
    render(
      <Stepper steps={steps} current="agreements" completed={["profile"]} onSelect={vi.fn()} />,
    );

    // The tick is decorative; the state has to be readable as text too.
    expect(screen.getByRole("tab", { name: /Your details/ }).textContent).toContain("done");
  });

  it("lets the applicant jump back to a step", () => {
    const onSelect = vi.fn();
    render(
      <Stepper steps={steps} current="agreements" completed={["profile"]} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Your details/ }));
    expect(onSelect).toHaveBeenCalledWith("profile");
  });

  it("flags a step the reviewer sent back", () => {
    render(
      <Stepper
        steps={steps}
        current="profile"
        completed={["profile", "agreements"]}
        changesRequested={["agreements"]}
        onSelect={vi.fn()}
      />,
    );

    const flagged = screen.getByRole("tab", { name: /Agreements/ });
    expect(flagged.textContent).toContain("needs changes");
    // A step the reviewer reopened must not still read as done.
    expect(flagged.textContent).not.toContain("done");
  });
});
