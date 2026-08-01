import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AllocationBar } from "../components/ui/allocation-bar";

const segments = [
  { id: "a", label: "Vanak Tower SPV", basisPoints: 7500, value: "750" },
  { id: "b", label: "Sadeghieh Retail", basisPoints: 2500, value: "250" },
];

describe("AllocationBar", () => {
  it("sizes each segment by its share", () => {
    render(<AllocationBar segments={segments} emptyLabel="Nothing to show" />);

    const bar = screen.getByTestId("allocation-a");
    expect(bar.style.width).toBe("75%");
    expect(screen.getByTestId("allocation-b").style.width).toBe("25%");
  });

  it("reads the split as text, not only as colour", () => {
    // A bar whose meaning lives only in its colours is unreadable to a screen
    // reader and to anyone who cannot distinguish them.
    render(<AllocationBar segments={segments} emptyLabel="Nothing to show" />);

    const legend = screen.getByRole("list");
    expect(legend.textContent).toContain("Vanak Tower SPV");
    expect(legend.textContent).toContain("75.0%");
    expect(legend.textContent).toContain("Sadeghieh Retail");
    expect(legend.textContent).toContain("25.0%");
  });

  it("says there is nothing to allocate rather than drawing an empty bar", () => {
    render(<AllocationBar segments={[]} emptyLabel="Nothing to show" />);

    expect(screen.getByText("Nothing to show")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("keeps a tiny holding visible instead of collapsing it to nothing", () => {
    // A 0.02% slice would otherwise render as a zero-width sliver the holder
    // cannot see or hover.
    render(
      <AllocationBar
        segments={[
          { id: "big", label: "Big", basisPoints: 9998, value: "9998" },
          { id: "tiny", label: "Tiny", basisPoints: 2, value: "2" },
        ]}
        emptyLabel="Nothing to show"
      />,
    );

    const tiny = screen.getByTestId("allocation-tiny");
    expect(Number.parseFloat(tiny.style.width)).toBeGreaterThanOrEqual(1);
    // …and the legend still states the true share, not the widened one.
    expect(screen.getByRole("list").textContent).toContain("0.0%");
  });
});
