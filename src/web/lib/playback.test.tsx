import { afterEach, describe, expect, it, vi } from "vitest";
import { installPlayback, pauseAll } from "./playback";

/** A media element whose play/pause are simulated (jsdom has no media pipeline). */
function player() {
  const el = document.createElement("audio");
  let paused = true;
  Object.defineProperty(el, "paused", { get: () => paused });
  el.pause = vi.fn(() => {
    paused = true;
  });
  const play = () => {
    paused = false;
    el.dispatchEvent(new Event("play"));
  };
  document.body.append(el);
  return { el, play };
}

let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  document.body.innerHTML = "";
});

describe("playback coordinator (ADR-0050)", () => {
  it("starting one player pauses every other playing one, keeping their position", () => {
    uninstall = installPlayback(document);
    const a = player();
    const b = player();
    a.play();
    b.play();
    expect(a.el.pause).toHaveBeenCalledTimes(1);
    expect(b.el.pause).not.toHaveBeenCalled();
    expect(a.el.currentTime).toBe(0); // pausing never rewinds
  });

  it("pauseAll pauses whatever plays (a route change)", () => {
    const a = player();
    a.play();
    pauseAll(document);
    expect(a.el.pause).toHaveBeenCalled();
    expect(a.el.paused).toBe(true);
  });

  it("uninstalling stops coordinating", () => {
    uninstall = installPlayback(document);
    uninstall();
    uninstall = undefined;
    const a = player();
    const b = player();
    a.play();
    b.play();
    expect(a.el.pause).not.toHaveBeenCalled();
  });
});
