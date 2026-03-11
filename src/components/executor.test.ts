import { afterEach, describe, expect, it, vi } from "vitest";

import { Doc } from "./document";
import { Executor } from "./executor";
import { acquireCaretLock, acquireSelectionLock, getSpanCharIndex, setLockProtectedRange } from "./locks";
import type { BotContext, Box, CursorAgent, EventBus } from "./types";

function createEventBus(): EventBus & { events: Array<{ boxId: number }> } {
  return {
    events: [],
    on: () => () => {},
    off: () => {},
    emit(_event, data) {
      this.events.push({ boxId: data.boxId });
    },
  };
}

function createBox(text: string): Box {
  const el = document.createElement("div");
  const textEl = document.createElement("div");

  el.className = "box";
  textEl.className = "text";
  textEl.textContent = text;
  el.append(textEl);
  document.body.appendChild(el);

  return {
    id: 1,
    doc: new Doc(text),
    el,
    textEl,
  };
}

function createAgent(lockSpan: HTMLSpanElement | null): CursorAgent {
  return {
    x: 0,
    y: 0,
    retiring: false,
    lockSpan,
    updateCursor() {},
    setMode() {},
    showCaret() {},
    showSelection() {},
  };
}

function createContext(eventBus: EventBus): BotContext {
  const cursorLayer = document.createElement("div");
  document.body.appendChild(cursorLayer);
  return {
    boxes: [],
    cursorLayer,
    charW: 10,
    wsRect: () => new DOMRect(0, 0, 500, 300),
    createBox: () => {
      throw new Error("not used in executor tests");
    },
    eventBus,
  };
}

describe("executor", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("types into the active lock span and emits one edit per character", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const box = createBox("hi");
    const lockSpan = document.createElement("span");
    lockSpan.className = "bot-lock";
    box.textEl.appendChild(lockSpan);
    const eventBus = createEventBus();
    const agent = createAgent(lockSpan);
    const executor = new Executor(agent, createContext(eventBus), 0);

    const pending = executor.typeInto(box, "!");
    await vi.runAllTimersAsync();
    await pending;

    expect(lockSpan.textContent).toBe("!");
    expect(box.doc.text).toBe("hi!");
    expect(eventBus.events).toHaveLength(1);
    expect(getSpanCharIndex(box.textEl, lockSpan) + (lockSpan.textContent?.length ?? 0)).toBe(3);
  });

  it("backspaces only the editable text immediately before the lock span", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const box = createBox("");
    box.textEl.textContent = "test";
    const lockSpan = acquireCaretLock(box.textEl, 4, 1) as HTMLSpanElement;
    box.doc.text = "test";

    const eventBus = createEventBus();
    const agent = createAgent(lockSpan);
    const executor = new Executor(agent, createContext(eventBus), 0);

    const pending = executor.backspace(box, 2);
    await vi.runAllTimersAsync();
    await pending;

    expect(box.textEl.textContent).toBe("te");
    expect(box.doc.text).toBe("te");
    expect(eventBus.events).toHaveLength(2);
    expect(getSpanCharIndex(box.textEl, lockSpan)).toBe(2);
  });

  it("turns a selected lock span into a caret after deleting the range", () => {
    const box = createBox("hello world");
    const lockSpan = document.createElement("span");
    lockSpan.className = "bot-lock";
    lockSpan.dataset.lockType = "selection";
    lockSpan.textContent = "world";
    box.textEl.textContent = "hello ";
    box.textEl.appendChild(lockSpan);
    box.doc.text = "hello world";

    const eventBus = createEventBus();
    const agent = createAgent(lockSpan);
    const executor = new Executor(agent, createContext(eventBus), 0);

    executor.deleteRange(box);

    expect(lockSpan.textContent).toBe("");
    expect(lockSpan.dataset.lockType).toBe("caret");
    expect(box.doc.text).toBe("hello ");
    expect(eventBus.events).toHaveLength(1);
  });

  it("keeps the animated typing caret boundary locked between keystrokes", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const box = createBox("abcd");
    const typingLock = acquireCaretLock(box.textEl, 1, 1);
    expect(typingLock).toBeInstanceOf(HTMLSpanElement);

    const eventBus = createEventBus();
    const agent = createAgent(typingLock);
    const executor = new Executor(agent, createContext(eventBus), 0);

    const pending = executor.typeInto(box, "xy");
    await Promise.resolve();

    expect(box.textEl.textContent).toBe("axbcd");
    expect(acquireCaretLock(box.textEl, 2, 2)).toBeNull();
    expect(acquireSelectionLock(box.textEl, 2, 3, 2)).toBeNull();

    await vi.runAllTimersAsync();
    await pending;

    expect(box.doc.text).toBe("axybcd");
    expect(eventBus.events).toHaveLength(2);
    expect(getSpanCharIndex(box.textEl, typingLock!) + (typingLock!.textContent?.length ?? 0)).toBe(3);
  });

  it("keeps the inserted span protected until the final typing delay finishes", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const box = createBox("abcd");
    const typingLock = acquireCaretLock(box.textEl, 1, 1) as HTMLSpanElement;
    const eventBus = createEventBus();
    const agent = createAgent(typingLock);
    const executor = new Executor(agent, createContext(eventBus), 0);

    const pending = executor.typeInto(box, "x");
    await Promise.resolve();

    expect(box.doc.text).toBe("axbcd");
    expect(acquireCaretLock(box.textEl, 1, 2)).toBeNull();
    expect(acquireCaretLock(box.textEl, 2, 2)).toBeNull();

    await vi.advanceTimersByTimeAsync(29);
    expect(acquireCaretLock(box.textEl, 0, 2)).not.toBeNull();
    expect(acquireSelectionLock(box.textEl, 1, 2, 2)).toBeNull();
    expect(acquireSelectionLock(box.textEl, 2, 3, 2)).toBeNull();

    await vi.runAllTimersAsync();
    await pending;
  });

  it("keeps the collapsed backspace edit protected until the final animation delay finishes", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const box = createBox("abcd");
    const lockSpan = acquireSelectionLock(box.textEl, 1, 2, 1) as HTMLSpanElement;
    setLockProtectedRange(lockSpan, 1, 2);
    const eventBus = createEventBus();
    const agent = createAgent(lockSpan);
    const executor = new Executor(agent, createContext(eventBus), 0);

    const pending = executor.backspace(box, 1);
    await Promise.resolve();

    expect(box.doc.text).toBe("acd");
    expect(lockSpan.dataset.lockType).toBe("caret");
    expect(acquireCaretLock(box.textEl, 1, 2)).toBeNull();
    expect(acquireCaretLock(box.textEl, 2, 2)).toBeNull();
    expect(acquireSelectionLock(box.textEl, 1, 2, 2)).toBeNull();

    await vi.advanceTimersByTimeAsync(24);
    expect(acquireCaretLock(box.textEl, 0, 2)).not.toBeNull();

    await vi.runAllTimersAsync();
    await pending;
  });
});
