import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { APP_LOAD, dialogState, isDialogVisit, Link, navigate, parseRoute, replace, useRoute } from "./router";

const ALL_VIEWS = { grid: { kind: "all" }, order: { kind: "all" } } as const;

function Show() {
  const route = useRoute();
  return (
    <div>
      <p>{route.name === "page" ? `page ${route.pathname}${route.search}` : `detail ${route.id}`}</p>
      <Link to="/generations/01ABC">open</Link>
    </div>
  );
}

describe("parseRoute", () => {
  it("reads a generation address as the detail route", () => {
    expect(parseRoute("/generations/01ABC")).toEqual({ name: "detail", id: "01ABC" });
    expect(parseRoute("/generations/01%20X/")).toEqual({ name: "detail", id: "01 X" });
  });

  it("keeps every other path as a page path for the section registry to match", () => {
    expect(parseRoute("/")).toEqual({ name: "page", pathname: "/", search: "" });
    expect(parseRoute("/gallery", "?deleted=1")).toEqual({ name: "page", pathname: "/gallery", search: "?deleted=1" });
    expect(parseRoute("/generations/")).toEqual({ name: "page", pathname: "/generations/", search: "" });
  });
});

describe("router", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("renders an unknown address as that page path — not as home", () => {
    window.history.replaceState(null, "", "/whatever");
    render(<Show />);
    expect(screen.getByText("page /whatever")).toBeInTheDocument();
  });

  it("renders the detail route and follows links, navigate() and back", () => {
    render(<Show />);
    fireEvent.click(screen.getByText("open"));
    expect(window.location.pathname).toBe("/generations/01ABC");
    expect(screen.getByText("detail 01ABC")).toBeInTheDocument();

    act(() => navigate("/"));
    expect(screen.getByText("page /")).toBeInTheDocument();

    act(() => {
      window.history.pushState(null, "", "/generations/02XYZ");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByText("detail 02XYZ")).toBeInTheDocument();
  });

  it("replace() swaps the address without a history entry and tells subscribers", () => {
    render(<Show />);
    act(() => navigate("/?rerun=01ABC"));
    expect(screen.getByText("page /?rerun=01ABC")).toBeInTheDocument();
    const depth = window.history.length;
    act(() => replace("/"));
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(depth);
    expect(screen.getByText("page /")).toBeInTheDocument();
  });
});

describe("history state (ADR-0033)", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  function State() {
    const route = useRoute();
    return <p>state {JSON.stringify(route.state)}</p>;
  }

  it("navigate() and replace() carry a state into history.state and useRoute()", () => {
    render(<State />);
    expect(screen.getByText("state null")).toBeInTheDocument();
    act(() => navigate("/generations/01A", dialogState(ALL_VIEWS)));
    const state = { ...dialogState(ALL_VIEWS) };
    expect(window.history.state).toEqual(state);
    expect(screen.getByText(`state ${JSON.stringify(state)}`)).toBeInTheDocument();
    act(() => replace("/generations/01B", { dialog: "gallery", load: "x" }));
    expect(window.history.state).toEqual({ dialog: "gallery", load: "x" });
    act(() => navigate("/gallery"));
    expect(window.history.state).toBeNull();
  });

  it("isDialogVisit is true only for a detail route carrying this load's dialog state", () => {
    const detail = { name: "detail", id: "01A" } as const;
    expect(isDialogVisit({ ...detail, state: dialogState(ALL_VIEWS) })).toBe(true);
    expect(isDialogVisit({ ...detail, state: { dialog: "gallery", load: "older" } })).toBe(false);
    expect(isDialogVisit({ ...detail, state: null })).toBe(false);
    expect(isDialogVisit({ name: "page", pathname: "/gallery", search: "", state: dialogState(ALL_VIEWS) })).toBe(
      false,
    );
    expect(typeof APP_LOAD).toBe("string");
  });
});
