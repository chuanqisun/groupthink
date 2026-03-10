import { describe, expect, it } from "vitest";

import {
  acquireCaretLock,
  acquireSelectionLock,
  getLockProtectedRange,
  getLockSpan,
  getSpanCharIndex,
  isRangeFree,
  releaseAllLocks,
  releaseLock,
  setLockProtectedRange,
} from "./locks";

function makeTextEl(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe("locks", () => {
  it("tracks selection ranges and rejects overlapping locks", () => {
    const textEl = makeTextEl("hello world");

    const span = acquireSelectionLock(textEl, 0, 5, 1);

    expect(span).toBeInstanceOf(HTMLSpanElement);
    expect(span?.textContent).toBe("hello");
    expect(getSpanCharIndex(textEl, span as HTMLSpanElement)).toBe(0);
    expect(isRangeFree(textEl, 2, 4, 2)).toBe(false);
    expect(isRangeFree(textEl, 6, 11, 2)).toBe(true);
    expect(acquireSelectionLock(textEl, 3, 8, 2)).toBeNull();
  });

  it("rejects a second caret lock at the same index", () => {
    const textEl = makeTextEl("abcdef");

    const firstCaret = acquireCaretLock(textEl, 3, 7);
    const secondCaret = acquireCaretLock(textEl, 3, 8);

    expect(firstCaret).toBeInstanceOf(HTMLSpanElement);
    expect(isRangeFree(textEl, 3, 3, 8)).toBe(false);
    expect(secondCaret).toBeNull();
  });

  it("treats an occupied caret position as blocked for insertions", () => {
    const textEl = makeTextEl("abcdef");

    expect(acquireCaretLock(textEl, 3, 7)).toBeInstanceOf(HTMLSpanElement);

    expect(isRangeFree(textEl, 3, 4, 8)).toBe(false);
    expect(acquireSelectionLock(textEl, 3, 4, 8)).toBeNull();
  });

  it("blocks edits at the live caret boundary while a bot is typing", () => {
    const textEl = makeTextEl("abcdef");
    const typingLock = acquireCaretLock(textEl, 3, 7) as HTMLSpanElement;
    typingLock.textContent = "xy";
    setLockProtectedRange(typingLock, 3, 5);

    expect(getSpanCharIndex(textEl, typingLock)).toBe(3);
    expect(getLockProtectedRange(textEl, typingLock)).toEqual({ start: 3, end: 5 });
    expect(isRangeFree(textEl, 3, 3, 8)).toBe(false);
    expect(isRangeFree(textEl, 5, 5, 8)).toBe(false);
    expect(isRangeFree(textEl, 5, 6, 8)).toBe(false);
    expect(acquireCaretLock(textEl, 5, 8)).toBeNull();
    expect(acquireSelectionLock(textEl, 5, 6, 8)).toBeNull();
  });

  it("exhaustively rejects second cursor endpoints that touch an existing protected range", () => {
    const cases = [
      { start: 0, end: 0, label: "caret at start" },
      { start: 1, end: 1, label: "caret in middle" },
      { start: 3, end: 3, label: "caret near end" },
      { start: 1, end: 3, label: "selection in middle" },
      { start: 0, end: 2, label: "selection from left edge" },
    ];

    for (const first of cases) {
      for (let secondStart = 0; secondStart <= 4; secondStart++) {
        for (let secondEnd = secondStart; secondEnd <= 4; secondEnd++) {
          const protectedStart = first.start;
          const protectedEnd = first.end;
          const boundaryConflict = (secondStart >= protectedStart && secondStart <= protectedEnd) || (secondEnd >= protectedStart && secondEnd <= protectedEnd);
          const interiorOverlap = secondStart < protectedEnd && secondEnd > protectedStart;
          const shouldBlock = boundaryConflict || interiorOverlap;

          const caretTextEl = makeTextEl("abcd");
          const caretFirstLock =
            first.start === first.end ? acquireCaretLock(caretTextEl, first.start, 1) : acquireSelectionLock(caretTextEl, first.start, first.end, 1);
          expect(caretFirstLock, `${first.label} should be created for caret case`).toBeInstanceOf(HTMLSpanElement);

          const caretResult = acquireCaretLock(caretTextEl, secondStart, 2);
          expect(caretResult === null, `first=${first.label} second caret=${secondStart}`).toBe(secondStart >= protectedStart && secondStart <= protectedEnd);

          const rangeTextEl = makeTextEl("abcd");
          const rangeFirstLock =
            first.start === first.end ? acquireCaretLock(rangeTextEl, first.start, 1) : acquireSelectionLock(rangeTextEl, first.start, first.end, 1);
          expect(rangeFirstLock, `${first.label} should be created for range case`).toBeInstanceOf(HTMLSpanElement);

          const rangeResult =
            secondStart === secondEnd ? acquireCaretLock(rangeTextEl, secondStart, 3) : acquireSelectionLock(rangeTextEl, secondStart, secondEnd, 3);
          expect(rangeResult === null, `first=${first.label} second range=${secondStart}-${secondEnd}`).toBe(shouldBlock);
        }
      }
    }
  });

  it("places caret locks at exact indices and restores text on release", () => {
    const textEl = makeTextEl("abcdef");

    const caret = acquireCaretLock(textEl, 3, 7);

    expect(caret).toBeInstanceOf(HTMLSpanElement);
    expect(getSpanCharIndex(textEl, caret as HTMLSpanElement)).toBe(3);
    expect(getLockSpan(textEl, 7)).toBe(caret);
    expect(isRangeFree(textEl, 3, 3, 8)).toBe(false);
    expect(isRangeFree(textEl, 3, 4, 8)).toBe(false);

    releaseLock(textEl, 7);
    expect(textEl.textContent).toBe("abcdef");
    expect(getLockSpan(textEl, 7)).toBeNull();
  });

  it("removes all locks without changing the document text", () => {
    const textEl = makeTextEl("alpha beta gamma");

    expect(acquireSelectionLock(textEl, 0, 5, 1)).not.toBeNull();
    expect(acquireCaretLock(textEl, 11, 2)).not.toBeNull();

    releaseAllLocks(textEl);

    expect(textEl.querySelector(".bot-lock")).toBeNull();
    expect(textEl.textContent).toBe("alpha beta gamma");
  });
});
