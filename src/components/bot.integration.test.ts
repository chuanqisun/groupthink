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

function setupBots(initialText: string): { box: Box; bot1: Bot; bot2: Bot; bot3: Bot } {
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
  const bot3 = new Bot(3, ctx);

  vi.spyOn(bot1.exec, "moveTo").mockResolvedValue();
  vi.spyOn(bot2.exec, "moveTo").mockResolvedValue();
  vi.spyOn(bot3.exec, "moveTo").mockResolvedValue();

  return { box, bot1, bot2, bot3 };
}

async function flushCommand(pending: Promise<void>): Promise<void> {
  await Promise.resolve();
  await vi.runAllTimersAsync();
  await pending;
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

  it("aborts stale planned replacements after another bot inserts before the target range", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2 } = setupBots("alpha beta");

    const staleReplace = {
      type: "replace",
      boxId: box.id,
      start: 6,
      end: 10,
      text: "BETA",
      expectedText: "alpha beta",
    } as const;

    const pending1 = bot1.executeCommand({ type: "insert", boxId: box.id, index: 0, text: "tiny " });
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await pending1;

    expect(box.doc.text).toBe("tiny alpha beta");

    await bot2.executeCommand(staleReplace);

    expect(box.doc.text).toBe("tiny alpha beta");
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });

  it("aborts stale planned deletes after another bot changes the box text", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2 } = setupBots("hello world");

    const staleDelete = {
      type: "delete",
      boxId: box.id,
      start: 6,
      end: 11,
      expectedText: "hello world",
    } as const;

    const pending1 = bot1.executeCommand({ type: "insert", boxId: box.id, index: 6, text: "tiny " });
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await pending1;

    expect(box.doc.text).toBe("hello tiny world");

    await bot2.executeCommand(staleDelete);

    expect(box.doc.text).toBe("hello tiny world");
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });

  it("aborts stale planned backspaces after another bot shifts the intended word boundary", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2 } = setupBots("alpha beta gamma");

    const staleBackspace = {
      type: "backspace",
      boxId: box.id,
      index: 10,
      count: 4,
      expectedText: "alpha beta gamma",
    } as const;

    const pending1 = bot1.executeCommand({ type: "insert", boxId: box.id, index: 6, text: "tiny " });
    await Promise.resolve();
    await vi.runAllTimersAsync();
    await pending1;

    expect(box.doc.text).toBe("alpha tiny beta gamma");

    await bot2.executeCommand(staleBackspace);

    expect(box.doc.text).toBe("alpha tiny beta gamma");
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });

  it("aborts stale competing inserts while another bot is mid-replacement retyping", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2, bot3 } = setupBots("alpha beta");
    vi.spyOn(bot1.exec, "dragSelect").mockImplementation(async (targetBox, start, end) => {
      bot1.showSelection(targetBox, start, end);
    });

    const pending1 = bot1.executeCommand({ type: "replace", boxId: box.id, start: 6, end: 10, text: "world" });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(35);

    expect(box.doc.text).toMatch(/^alpha\s(?:|w|wo)$/);

    const pending2 = bot2.executeCommand({ type: "insert", boxId: box.id, index: 8, text: "Z", expectedText: "alpha beta" });
    await Promise.resolve();

    const pending3 = bot3.executeCommand({ type: "insert", boxId: box.id, index: 7, text: "Q", expectedText: "alpha beta" });
    await Promise.resolve();

    expect(box.doc.text).toMatch(/^alpha\s(?:|w|wo)$/);

    await flushCommand(pending1);
    await flushCommand(pending2);
    await flushCommand(pending3);

    expect(box.doc.text).toBe("alpha world");
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });

  it("aborts a stale insert if another bot changes the text during caret placement", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2 } = setupBots("abcd");
    const realPlaceCaret = bot1.exec.placeCaret.bind(bot1.exec);

    vi.spyOn(bot1.exec, "placeCaret").mockImplementation(async (targetBox, index) => {
      await bot2.executeCommand({ type: "insert", boxId: targetBox.id, index: 0, text: "Q" });
      await realPlaceCaret(targetBox, index);
    });

    const pending = bot1.executeCommand({ type: "insert", boxId: box.id, index: 2, text: "Z", expectedText: "abcd" });
    await flushCommand(pending);

    expect(box.doc.text).toBe("Qabcd");
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });

  it("aborts a stale replace if another bot changes the text during selection animation", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2 } = setupBots("alpha beta");
    const realDragSelect = bot1.exec.dragSelect.bind(bot1.exec);

    vi.spyOn(bot1.exec, "dragSelect").mockImplementation(async (targetBox, start, end) => {
      await bot2.executeCommand({ type: "insert", boxId: targetBox.id, index: 0, text: "Q" });
      await realDragSelect(targetBox, start, end);
    });

    const pending = bot1.executeCommand({ type: "replace", boxId: box.id, start: 6, end: 10, text: "world", expectedText: "alpha beta" });
    await flushCommand(pending);

    expect(box.doc.text).toBe("Qalpha beta");
    expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
  });

  it("survives repeated asynchronous contention without leaving interwoven text or orphaned locks", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { box, bot1, bot2, bot3 } = setupBots("seed");

    const operations = [
      () => bot1.executeCommand({ type: "insert", boxId: box.id, index: 0, text: "A" }),
      () => bot2.executeCommand({ type: "insert", boxId: box.id, index: 0, text: "B", expectedText: "seed" }),
      () => bot3.executeCommand({ type: "replace", boxId: box.id, start: 0, end: 4, text: "core", expectedText: "seed" }),
      () => bot2.executeCommand({ type: "delete", boxId: box.id, start: 0, end: 1, expectedText: box.doc.text }),
      () => bot1.executeCommand({ type: "insert", boxId: box.id, index: box.doc.text.length, text: " tail", expectedText: box.doc.text }),
    ];

    for (const startOp of operations) {
      const pending = startOp();
      await flushCommand(pending);
      expect(box.textEl.querySelectorAll(".bot-lock")).toHaveLength(0);
      expect(box.textEl.textContent).toBe(box.doc.text);
    }

    expect(box.doc.text.includes("AB")).toBe(false);
    expect(box.doc.text.includes("BA")).toBe(false);
    expect(box.textEl.querySelector(".bot-lock")).toBeNull();
  });
});
