import { afterEach, describe, expect, it, vi } from "vitest";

import { Doc } from "./document";
import { Executor } from "./executor";
import { acquireCaretLock, acquireSelectionLock } from "./locks";
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
  const overlayEl = document.createElement("div");

  el.className = "box";
  textEl.className = "text";
  textEl.textContent = text;
  el.append(textEl, overlayEl);
  document.body.appendChild(el);

  return {
    id: 1,
    doc: new Doc(text),
    el,
    textEl,
    overlayEl,
  };
}

function createAgent(lockSpan: HTMLSpanElement | null): CursorAgent & { carets: number[] } {
  return {
    x: 0,
    y: 0,
    retiring: false,
    lockSpan,
    carets: [],
    updateCursor() {},
    setMode() {},
    showCaret() {},
    showSelection() {},
    _renderCaret(_box, index) {
      this.carets.push(index);
    },
    _renderSel() {},
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
    const executor = new Executor(agent, createContext(eventBus));

    const pending = executor.typeInto(box, "!");
    await vi.runAllTimersAsync();
    await pending;

    expect(lockSpan.textContent).toBe("!");
    expect(box.doc.text).toBe("hi!");
    expect(eventBus.events).toHaveLength(1);
    expect(agent.carets.at(-1)).toBe(3);
  });

  it("backspaces only the editable text immediately before the lock span", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const box = createBox("");
    box.textEl.textContent = "test";
    const lockSpan = document.createElement("span");
    lockSpan.className = "bot-lock";
    box.textEl.appendChild(lockSpan);
    box.doc.text = "test";

    const eventBus = createEventBus();
    const agent = createAgent(lockSpan);
    const executor = new Executor(agent, createContext(eventBus));

    const pending = executor.backspace(box, 2);
    await vi.runAllTimersAsync();
    await pending;

    expect(box.textEl.textContent).toBe("te");
    expect(box.doc.text).toBe("te");
    expect(eventBus.events).toHaveLength(2);
    expect(agent.carets.at(-1)).toBe(2);
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
    const executor = new Executor(agent, createContext(eventBus));

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
    const executor = new Executor(agent, createContext(eventBus));

    const pending = executor.typeInto(box, "xy");
    await Promise.resolve();

    expect(box.textEl.textContent).toBe("axbcd");
    expect(acquireCaretLock(box.textEl, 2, 2)).toBeNull();
    expect(acquireSelectionLock(box.textEl, 2, 3, 2)).toBeNull();

    await vi.runAllTimersAsync();
    await pending;

    expect(box.doc.text).toBe("axybcd");
    expect(eventBus.events).toHaveLength(2);
    expect(agent.carets.at(-1)).toBe(3);
  });
});
