import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bringCardIntoView } from "./gridPlace";
import { neighbours } from "./neighbours";
import { usePagingSentinel } from "./usePagingSentinel";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("media-gallery primitives", () => {
  it("brings a card into view by the medium's own id attribute", () => {
    document.body.innerHTML = `<div data-recording-id="R1"></div>`;
    const card = document.querySelector<HTMLElement>("[data-recording-id]") as HTMLElement;
    card.getBoundingClientRect = () => ({ top: 5000, bottom: 5100 }) as DOMRect;
    card.scrollIntoView = vi.fn();
    bringCardIntoView("R1", "data-recording-id");
    expect(card.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("finds neighbours in a newest-first list", () => {
    expect(neighbours([{ id: "3" }, { id: "2" }, { id: "1" }], "2")).toEqual({
      newer: "3",
      older: "1",
      atEnd: false,
      inOrder: true,
    });
  });

  it("gives the grid a sentinel ref and stays disarmed while paused", () => {
    const fetchNextPage = vi.fn();
    const { result } = renderHook(() =>
      usePagingSentinel({
        ready: true,
        paused: true,
        hasNextPage: true,
        isFetching: false,
        isFetchNextPageError: false,
        fetchNextPage,
      }),
    );
    expect(result.current.sentinelRef).toHaveProperty("current");
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
