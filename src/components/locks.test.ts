import { describe, expect, it } from "vitest";

import { acquireCaretLock, acquireSelectionLock, getLockSpan, getSpanCharIndex, isRangeFree, releaseAllLocks, releaseLock } from "./locks";

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

    expect(getSpanCharIndex(textEl, typingLock)).toBe(3);
    expect(isRangeFree(textEl, 5, 5, 8)).toBe(false);
    expect(isRangeFree(textEl, 5, 6, 8)).toBe(false);
    expect(acquireCaretLock(textEl, 5, 8)).toBeNull();
    expect(acquireSelectionLock(textEl, 5, 6, 8)).toBeNull();
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
