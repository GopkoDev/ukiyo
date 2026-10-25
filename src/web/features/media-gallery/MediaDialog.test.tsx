import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaDialog } from "./MediaDialog";

type Thing = { id: string; name: string };
const items: Thing[] = [3, 2, 1].map((i) => ({ id: `T${i}`, name: `Thing ${i}` }));

function Harness({ id, go }: { id: string; go: (id: string) => void }) {
  const list = useInfiniteQuery({
    queryKey: ["things"],
    queryFn: async () => ({ items, nextCursor: null as string | null }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p: { nextCursor: string | null }) => p.nextCursor ?? undefined,
  });
  return (
    <MediaDialog<Thing>
      id={id}
      noun="thing"
      list={list}
      go={go}
      title={items.find((t) => t.id === id)?.name}
      cardAttr="data-thing-id"
      keepsScroll={false}
      placeholder={(c) => <p>{c}</p>}
      onDeleted={{ removeCard: () => {}, refresh: () => {}, showGridNotice: () => {}, cleanup: () => {} }}
    >
      <p>body of {id}</p>
    </MediaDialog>
  );
}

const renderAt = (id: string, go = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness id={id} go={go} />
    </QueryClientProvider>,
  );
  return go;
};

afterEach(() => vi.restoreAllMocks());

describe("MediaDialog (shared stepping engine)", () => {
  it("names the medium in its labels and steps through the loaded order with the arrow keys", async () => {
    const go = renderAt("T2");
    expect(await screen.findByRole("heading", { name: "Thing 2" })).toBeInTheDocument();
    expect(screen.getByText("body of T2")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Older/ })).toBeEnabled());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    expect(go).toHaveBeenCalledWith("T1");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    expect(go).toHaveBeenCalledWith("T3");
    expect(screen.getByRole("dialog", { description: "One thing of the gallery" })).toBeInTheDocument();
  });

  it("never steps while a media player has the focus", async () => {
    const go = renderAt("T2");
    await screen.findByText("body of T2");
    const audio = document.createElement("audio");
    screen.getByText("body of T2").append(audio);
    fireEvent.keyDown(audio, { key: "ArrowRight" });
    expect(go).not.toHaveBeenCalled();
  });
});
