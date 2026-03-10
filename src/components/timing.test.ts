import { afterEach, describe, expect, it, vi } from "vitest";

import { chance, clamp, rand, sleep } from "./timing";

describe("timing", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("computes bounded random values from Math.random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    expect(rand(10, 30)).toBe(15);
    expect(chance(0.3)).toBe(true);
    expect(chance(0.2)).toBe(false);
  });

  it("clamps values to the provided range", () => {
    expect(clamp(-4, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it("resolves sleep after the requested delay", async () => {
    vi.useFakeTimers();

    const done = vi.fn();
    const pending = sleep(75).then(done);

    await vi.advanceTimersByTimeAsync(74);
    expect(done).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toHaveBeenCalledTimes(1);
  });
});
