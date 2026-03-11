import { describe, expect, it } from "vitest";

import { expandDeleteRange, getBackspaceRange } from "./linguistics";

describe("linguistics delete safety", () => {
  it("expands deleting a separating space to a whole-word range", () => {
    expect(expandDeleteRange("hello world", 5, 6)).toEqual([0, 6]);
  });

  it("keeps whole-word deletions unchanged", () => {
    expect(expandDeleteRange("hello world", 0, 5)).toEqual([0, 5]);
    expect(expandDeleteRange("hello world", 6, 11)).toEqual([6, 11]);
  });

  it("backspaces the previous word instead of only deleting the gap", () => {
    expect(getBackspaceRange("hello world", 6)).toEqual([0, 6]);
  });

  it("backspaces the current word when the caret is at its end", () => {
    expect(getBackspaceRange("hello world", 11)).toEqual([6, 11]);
  });
});
