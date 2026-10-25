import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CostLabel } from "./CostLabel";

describe("CostLabel", () => {
  it("shows a known cost plainly and an unknown one muted, never as $0", () => {
    const { rerender } = render(<CostLabel costStatus="known" costMicros={41_000} estimateMicros={40_000} />);
    expect(screen.getByText("$0.041")).toBeVisible();
    rerender(<CostLabel costStatus="unavailable" costMicros={null} estimateMicros={41_000} />);
    const label = screen.getByText("cost unavailable · ≈ $0.041");
    expect(label).toHaveClass("text-muted-foreground");
    expect(label).toHaveAttribute("title", "The provider didn't report this recording's cost; ≈ is the estimate");
    rerender(<CostLabel costStatus="pending" costMicros={null} estimateMicros={null} />);
    expect(screen.getByText("cost pending")).toHaveAttribute("title", "Waiting for the provider to report the cost");
    expect(screen.queryByText(/\$0(?!\.)/)).not.toBeInTheDocument();
  });
});
