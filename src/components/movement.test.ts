import { afterEach, describe, expect, it, vi } from "vitest";

import { animateSegment, humanEase, moveHumanLike } from "./movement";
import type { CursorAgent } from "./types";

function makeAgent(x = 0, y = 0): CursorAgent & { updates: Array<{ x: number; y: number }> } {
  return {
    x,
    y,
    retiring: false,
    lockSpan: null,
    updates: [],
    updateCursor() {
      this.updates.push({ x: this.x, y: this.y });
    },
    setMode() {},
    showCaret() {},
    showSelection() {},
    _renderCaret() {},
    _renderSel() {},
  };
}

describe("movement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses a monotonic easing curve", () => {
    const samples = [0, 0.05, 0.25, 0.5, 0.8, 1].map(humanEase);

    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
  });

  it("animates to the final point and updates the cursor along the way", async () => {
    const agent = makeAgent(5, 8);
    let frameNow = 0;

    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frameNow += 16;
      cb(frameNow);
      return frameNow;
    });

    await animateSegment(agent, { x: 5, y: 8 }, { x: 60, y: 35 }, 64);

    expect(agent.updates.length).toBeGreaterThan(2);
    expect(agent.x).toBe(60);
    expect(agent.y).toBe(35);
    expect(agent.updates.at(-1)).toEqual({ x: 60, y: 35 });
  });

  it("moves human-like to the exact requested target", async () => {
    const agent = makeAgent(0, 0);
    let frameNow = 0;

    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frameNow += 16;
      cb(frameNow);
      return frameNow;
    });

    await moveHumanLike(agent, 120, 48, "text");

    expect(agent.x).toBe(120);
    expect(agent.y).toBe(48);
    expect(agent.updates.length).toBeGreaterThan(4);
  });
});
