import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotesCard } from "./NotesCard";

const renderCard = (over: Partial<Parameters<typeof NotesCard>[0]> = {}) => {
  const props: Parameters<typeof NotesCard>[0] = {
    item: { id: "R1", tags: ["intro"], comment: null },
    setComment: vi.fn(async (body: string) => ({ comment: { body, updatedAt: "2026-10-25T10:00:00.000Z" } })),
    addTag: vi.fn(async (raw: string) => ({ tags: ["intro", raw.trim().toLowerCase()] })),
    removeTag: vi.fn(async () => ({ tags: [] })),
    onPatched: vi.fn(),
    onGone: vi.fn(() => false),
    ...over,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotesCard {...props} />
    </QueryClientProvider>,
  );
  return props;
};

describe("NotesCard (shared notes for any medium)", () => {
  it("adds a tag through the medium's own call and reports the patch", async () => {
    const p = renderCard();
    fireEvent.change(screen.getByLabelText("Add a tag"), { target: { value: " Take " } });
    fireEvent.keyDown(screen.getByLabelText("Add a tag"), { key: "Enter" });
    await waitFor(() => expect(p.onPatched).toHaveBeenCalledWith({ tags: ["intro", "take"] }));
    expect(p.addTag).toHaveBeenCalledWith(" Take ");
  });

  it("saves a comment through the medium's call; refuses one over 2 000 characters before sending", async () => {
    const p = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "x".repeat(2001) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Comment must be at most 2 000 characters")).toBeInTheDocument();
    expect(p.setComment).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "keep" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(p.onPatched).toHaveBeenCalledWith({ comment: expect.objectContaining({ body: "keep" }) }),
    );
  });
});
