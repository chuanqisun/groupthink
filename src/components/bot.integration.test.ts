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

function setupBots(initialText: string): { box: Box; bot1: Bot; bot2: Bot } {
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
  const bot1 = new Bot(1, ctx);
  const bot2 = new Bot(2, ctx);

  vi.spyOn(bot1.exec, "moveTo").mockResolvedValue();
  vi.spyOn(bot2.exec, "moveTo").mockResolvedValue();

  return { box, bot1, bot2 };
}

describe("multi-bot integration", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("prevents a second bot from inserting into a word while the first bot is mid-typing", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2 } = setupBots("abcd");

    const pending1 = bot1.executeCommand({ type: "insert", boxId: box.id, index: 1, text: "xy" });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(28);

    expect(box.doc.text).toBe("axbcd");

    await bot2.executeCommand({ type: "insert", boxId: box.id, index: 2, text: "Z" });

    expect(box.doc.text).toBe("axbcd");

    await vi.runAllTimersAsync();
    await pending1;

    expect(box.doc.text).toBe("axybcd");
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });

  it("prevents overlapping edits while another bot holds a live selection lock", async () => {
    const { box, bot1, bot2 } = setupBots("abcdef");

    bot1.showSelection(box, 1, 4);
    expect(bot1.lockSpan).toBeInstanceOf(HTMLSpanElement);
    expect(bot1.lockSpan?.dataset.lockType).toBe("selection");
    expect(box.doc.text).toBe("abcdef");

    await bot2.executeCommand({ type: "replace", boxId: box.id, start: 2, end: 3, text: "Z" });

    expect(box.doc.text).toBe("abcdef");

    bot1.hideOverlay();
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });

  it("aborts stale planned inserts after another bot shifts the text", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2 } = setupBots("abcd");

    const staleInsert = { type: "insert", boxId: box.id, index: 2, text: "Z", expectedText: "abcd" } as const;

    const pending1 = bot1.executeCommand({ type: "insert", boxId: box.id, index: 1, text: "xy" });
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await pending1;

    expect(box.doc.text).toBe("axybcd");

    await bot2.executeCommand(staleInsert);

    expect(box.doc.text).toBe("axybcd");
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });
});
