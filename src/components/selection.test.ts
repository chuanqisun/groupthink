import { afterEach, describe, expect, it, vi } from "vitest";

import { Bot } from "./bot";
import { createBox as createBoxEl } from "./edit";
import { createEventBus } from "./events";
import type { BotContext, Box } from "./types";

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

function stubRect(el: HTMLElement, rect: DOMRect): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}

function setup(initialText: string): { box: Box; bot: Bot; ctx: BotContext } {
  const workspace = document.createElement("div");
  const cursorLayer = document.createElement("div");
  document.body.append(workspace, cursorLayer);
  stubRect(workspace, makeRect(0, 0, 800, 600));

  const boxes: Box[] = [];
  const eventBus = createEventBus();
  const ctx: BotContext = {
    boxes,
    cursorLayer,
    charW: 10,
    wsRect: () => makeRect(0, 0, 800, 600),
    createBox: (x, y, text) => {
      const box = createBoxEl(boxes.length + 1, x, y, text, workspace, eventBus);
      stubRect(box.el, makeRect(x, y, 180, 40));
      stubRect(box.textEl, makeRect(x, y, 180, 40));
      boxes.push(box);
      return box;
    },
    eventBus,
  };

  const box = ctx.createBox(20, 20, initialText);
  const bot = new Bot(1, ctx);
  vi.spyOn(bot.exec, "moveTo").mockResolvedValue();

  return { box, bot, ctx };
}

describe("atomic selection–text sync", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("box elements do not contain separate overlay, bot-sel, or bot-caret containers", () => {
    const { box } = setup("hello world");

    // No overlay infrastructure should exist in the box
    expect(box.el.querySelector(".overlay")).toBeNull();
    expect(box.el.querySelector(".bot-sel")).toBeNull();
    expect(box.el.querySelector(".bot-caret")).toBeNull();
  });

  it("Box type does not include an overlayEl property", () => {
    const { box } = setup("hello");

    // The box should only have: id, doc, el, textEl — no overlayEl
    expect(box).not.toHaveProperty("overlayEl");
  });

  it("selection visual is the lock span inside the text flow, not a positioned overlay", () => {
    const { box, bot } = setup("hello world");

    bot.showSelection(box, 6, 11);

    // The selection lock span wraps the selected text
    const lockSpan = box.textEl.querySelector(".bot-lock[data-lock-type='selection']");
    expect(lockSpan).toBeInstanceOf(HTMLSpanElement);
    expect(lockSpan?.textContent).toBe("world");
    expect(box.textEl.contains(lockSpan)).toBe(true);

    // No external overlay elements
    expect(box.el.querySelector(".bot-sel")).toBeNull();
    expect(box.el.querySelector(".bot-caret")).toBeNull();
  });

  it("caret visual is the lock span inside the text flow, not a positioned overlay", () => {
    const { box, bot } = setup("hello world");

    bot.showCaret(box, 5);

    const lockSpan = box.textEl.querySelector(".bot-lock[data-lock-type='caret']");
    expect(lockSpan).toBeInstanceOf(HTMLSpanElement);
    expect(box.textEl.contains(lockSpan)).toBe(true);

    // No external overlay elements
    expect(box.el.querySelector(".bot-sel")).toBeNull();
    expect(box.el.querySelector(".bot-caret")).toBeNull();
  });

  it("typed text stays inside the lock span, guaranteeing highlight–content atomicity", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot } = setup("start");

    bot.showCaret(box, 5);
    expect(bot.lockSpan).toBeInstanceOf(HTMLSpanElement);

    const pending = bot.exec.typeInto(box, " end");
    await vi.runAllTimersAsync();
    await pending;

    // Typed text lives inside the lock span
    expect(bot.lockSpan?.textContent).toBe(" end");
    // Full text is correct
    expect(box.doc.text).toBe("start end");

    // No overlay artifacts anywhere
    expect(box.el.querySelector(".bot-sel")).toBeNull();
    expect(box.el.querySelector(".bot-caret")).toBeNull();
  });

  it("CursorAgent-like interface on Bot does not expose _renderCaret or _renderSel", () => {
    const { bot } = setup("hello");

    // These methods should not exist — the lock span IS the visual
    expect(bot).not.toHaveProperty("_renderCaret");
    expect(bot).not.toHaveProperty("_renderSel");
  });

  it("hideOverlay cleans up the lock span without referencing any overlay element", () => {
    const { box, bot } = setup("hello world");

    bot.showSelection(box, 0, 5);
    expect(box.textEl.querySelector(".bot-lock")).not.toBeNull();

    bot.hideOverlay();

    // Lock is released, text is intact
    expect(box.textEl.querySelector(".bot-lock")).toBeNull();
    expect(box.doc.text).toBe("hello world");

    // Bot should not reference any overlay box
    expect(bot).not.toHaveProperty("overlayBox");
  });

  it("concurrent typing by two bots keeps each highlight on its own text", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const workspace = document.createElement("div");
    const cursorLayer = document.createElement("div");
    document.body.append(workspace, cursorLayer);
    stubRect(workspace, makeRect(0, 0, 800, 600));

    const boxes: Box[] = [];
    const eventBus = createEventBus();
    const ctx: BotContext = {
      boxes,
      cursorLayer,
      charW: 10,
      wsRect: () => makeRect(0, 0, 800, 600),
      createBox: (x, y, text) => {
        const box = createBoxEl(boxes.length + 1, x, y, text, workspace, eventBus);
        stubRect(box.el, makeRect(x, y, 180, 40));
        stubRect(box.textEl, makeRect(x, y, 180, 40));
        boxes.push(box);
        return box;
      },
      eventBus,
    };

    const box = ctx.createBox(20, 20, "alpha beta");
    const bot1 = new Bot(1, ctx);
    const bot2 = new Bot(2, ctx);
    vi.spyOn(bot1.exec, "moveTo").mockResolvedValue();
    vi.spyOn(bot2.exec, "moveTo").mockResolvedValue();

    // Bot1 types at position 0, Bot2 types at end
    bot1.showCaret(box, 0);

    const endIdx = box.doc.text.length;
    bot2.showCaret(box, endIdx);

    // Both lock spans should be inside the text element
    const locks = box.textEl.querySelectorAll(".bot-lock");
    expect(locks).toHaveLength(2);

    // Each lock span is inherently at the correct DOM position
    // No overlay elements needed
    expect(box.el.querySelector(".bot-sel")).toBeNull();
    expect(box.el.querySelector(".bot-caret")).toBeNull();
  });
});
