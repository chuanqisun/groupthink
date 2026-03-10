import { ARROW_SVG, IBEAM_SVG } from "./cursors";
import { canBotUseBox, getText, isHumanFocusedBox, moveBox, PAD_X, safeSyncTextEl, syncDocText } from "./edit";
import { Executor } from "./executor";
import { pickRange, randomWords } from "./linguistics";
import { acquireCaretLock, acquireSelectionLock, getSpanCharIndex, isRangeFree, LOCK_CARET, releaseLock } from "./locks";
import { randomEdgePoint } from "./movement";
import { RandomPlanner } from "./planner";
import { BOT_LIFETIME_MAX, BOT_LIFETIME_MIN, BOT_RETIRE_CHECK_CHANCE } from "./pool";
import { chance, rand, sleep } from "./timing";
import type { BotContext, Box, Command } from "./types";

const ACTION_PAUSE_MIN = 30;
const ACTION_PAUSE_MAX = 280;

function cleanupAdjacentWhitespace(span: HTMLSpanElement): void {
  const prev = span.previousSibling;
  const next = span.nextSibling;
  const prevIsText = prev instanceof Text;
  const nextIsText = next instanceof Text;

  if (prevIsText && nextIsText) {
    const prevText = prev.textContent ?? "";
    const nextText = next.textContent ?? "";
    if (prevText.endsWith(" ") && nextText.startsWith(" ")) {
      next.textContent = nextText.slice(1);
      if (!next.textContent) next.remove();
      return;
    }
  }

  if (!prev && nextIsText && (next.textContent ?? "").startsWith(" ")) {
    next.textContent = (next.textContent ?? "").slice(1);
    if (!next.textContent) next.remove();
    return;
  }

  if (!next && prevIsText && (prev.textContent ?? "").endsWith(" ")) {
    prev.textContent = (prev.textContent ?? "").slice(0, -1);
    if (!prev.textContent) prev.remove();
  }
}

export class Bot {
  id: number;
  ctx: BotContext;
  retiring: boolean;
  mode: "arrow" | "ibeam";
  birth: number;
  maxLifetime: number;
  x: number;
  y: number;
  cursor: HTMLDivElement;
  selEl: HTMLDivElement;
  caretEl: HTMLDivElement;
  overlayBox: Box | null;
  lockSpan: HTMLSpanElement | null;
  exec: Executor;
  planner: RandomPlanner;
  _onEdit: ({ boxId }: { boxId: number }) => void;

  constructor(id: number, ctx: BotContext) {
    this.id = id;
    this.ctx = ctx;
    this.retiring = false;
    this.mode = "arrow";
    this.birth = performance.now();
    this.maxLifetime = rand(BOT_LIFETIME_MIN, BOT_LIFETIME_MAX);

    const p = randomEdgePoint(ctx.wsRect());
    this.x = p.x;
    this.y = p.y;

    this.cursor = document.createElement("div");
    this.cursor.className = "bot-cursor";
    this.cursor.innerHTML = ARROW_SVG;
    ctx.cursorLayer.appendChild(this.cursor);

    this.selEl = document.createElement("div");
    this.selEl.className = "bot-sel";
    this.caretEl = document.createElement("div");
    this.caretEl.className = "bot-caret";
    this.overlayBox = null;
    this.lockSpan = null;

    this._onEdit = ({ boxId }) => {
      if (!this.lockSpan || !this.overlayBox || this.overlayBox.id !== boxId) return;
      if (!this.overlayBox.textEl.contains(this.lockSpan)) return;
      const spanIdx = getSpanCharIndex(this.overlayBox.textEl, this.lockSpan);
      const spanLen = this.lockSpan.textContent?.length ?? 0;
      if (this.lockSpan.dataset.lockType === LOCK_CARET) {
        this._renderCaret(this.overlayBox, spanIdx + spanLen);
      } else {
        this._renderSel(this.overlayBox, spanIdx, spanIdx + spanLen);
      }
    };
    ctx.eventBus.on("edit", this._onEdit);

    this.exec = new Executor(this, ctx);
    this.planner = new RandomPlanner();
    this.updateCursor();
  }

  updateCursor(): void {
    this.cursor.style.transform = `translate(${this.x}px,${this.y}px)`;
  }

  setMode(mode: "arrow" | "ibeam"): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.cursor.innerHTML = mode === "ibeam" ? IBEAM_SVG : ARROW_SVG;
    this.cursor.style.width = mode === "ibeam" ? "20px" : "24px";
  }

  attachOverlay(box: Box): void {
    if (this.overlayBox !== box) {
      this.hideOverlay();
      if (box.overlayEl && box.el.isConnected) {
        box.overlayEl.appendChild(this.selEl);
        box.overlayEl.appendChild(this.caretEl);
        this.overlayBox = box;
      }
    }
  }

  hideOverlay(): void {
    if (this.lockSpan && this.overlayBox) {
      if (!this.lockSpan.textContent) {
        cleanupAdjacentWhitespace(this.lockSpan);
      }
      releaseLock(this.overlayBox.textEl, this.id);
      syncDocText(this.overlayBox);
      safeSyncTextEl(this.overlayBox);
      this.lockSpan = null;
    }
    this.selEl.style.display = "none";
    this.caretEl.style.display = "none";
    this.overlayBox = null;
  }

  _renderCaret(_box: Box, index: number): void {
    this.selEl.style.display = "none";
    this.caretEl.style.display = "block";
    this.caretEl.style.left = `${PAD_X + this.ctx.charW * index}px`;
  }

  _renderSel(_box: Box, start: number, end: number): void {
    if (end < start) [start, end] = [end, start];
    if (start === end) {
      this._renderCaret(_box, start);
      return;
    }
    this.caretEl.style.display = "none";
    this.selEl.style.display = "block";
    this.selEl.style.left = `${PAD_X + this.ctx.charW * start}px`;
    this.selEl.style.width = `${Math.max(1, this.ctx.charW * (end - start))}px`;
  }

  showCaret(box: Box, index: number): void {
    if (!box.el.isConnected) return;
    this.attachOverlay(box);
    if (!this.lockSpan || !box.textEl.contains(this.lockSpan)) {
      this.lockSpan = acquireCaretLock(box.textEl, index, this.id);
    }
    if (!this.lockSpan) return;
    this._renderCaret(box, index);
  }

  showSelection(box: Box, start: number, end: number): void {
    if (!box.el.isConnected) return;
    this.attachOverlay(box);
    if (end < start) [start, end] = [end, start];
    if (this.lockSpan) {
      releaseLock(box.textEl, this.id);
      syncDocText(box);
      this.lockSpan = null;
    }
    this.lockSpan = acquireSelectionLock(box.textEl, start, end, this.id);
    if (!this.lockSpan) return;
    this._renderSel(box, start, end);
  }

  _findBox(boxId: number): Box | undefined {
    return this.ctx.boxes.find((box) => box.id === boxId);
  }

  async executeCommand(cmd: Command): Promise<void> {
    switch (cmd.type) {
      case "move":
        return this._execMove(cmd);
      case "create":
        return this._execCreate(cmd);
      case "append":
        return this._execAppend(cmd);
      case "insert":
        return this._execInsert(cmd);
      case "replace":
        return this._execReplace(cmd);
      case "delete":
        return this._execDelete(cmd);
      case "backspace":
        return this._execBackspace(cmd);
      case "moveBox":
        return this._execMoveBox(cmd);
    }
  }

  async _execMove(cmd: Extract<Command, { type: "move" }>): Promise<void> {
    this.setMode("arrow");
    await this.exec.moveTo(cmd.x, cmd.y, "travel");
    await sleep(rand(40, 180));
  }

  async _execCreate(cmd: Extract<Command, { type: "create" }>): Promise<void> {
    const { wsRect, createBox } = this.ctx;
    const r = wsRect();
    await this.exec.clickAt(r.left + cmd.x, r.top + cmd.y);
    const box = createBox(cmd.x, cmd.y, "");
    if (!canBotUseBox(box)) return;
    try {
      await sleep(rand(20, 80));
      await this.exec.placeCaret(box, 0);
      await this.exec.typeInto(box, cmd.text);
      if (chance(0.25) && getText(box).length > 3) {
        const text = getText(box);
        const [a, b] = pickRange(text);
        if (!isRangeFree(box.textEl, a, b, this.id)) return;
        await this.exec.dragSelect(box, a, b);
        this.exec.deleteRange(box);
        const spanIdx = this.lockSpan ? getSpanCharIndex(box.textEl, this.lockSpan) : a;
        this._renderCaret(box, spanIdx);
        await sleep(rand(30, 70));
        if (chance(0.7)) await this.exec.typeInto(box, randomWords(1, 2));
      }
    } finally {
      this.hideOverlay();
      this.setMode("arrow");
    }
  }

  async _execAppend(cmd: Extract<Command, { type: "append" }>): Promise<void> {
    const box = this._findBox(cmd.boxId);
    if (!canBotUseBox(box)) return;
    try {
      const text = getText(box);
      await this.exec.placeCaret(box, text.length);
      await this.exec.typeInto(box, cmd.text);
    } finally {
      this.hideOverlay();
      this.setMode("arrow");
    }
  }

  async _execInsert(cmd: Extract<Command, { type: "insert" }>): Promise<void> {
    const box = this._findBox(cmd.boxId);
    if (!canBotUseBox(box)) return;
    if (!isRangeFree(box.textEl, cmd.index, cmd.index, this.id)) return;
    try {
      await this.exec.placeCaret(box, cmd.index);
      await this.exec.typeInto(box, cmd.text);
    } finally {
      this.hideOverlay();
      this.setMode("arrow");
    }
  }

  async _execReplace(cmd: Extract<Command, { type: "replace" }>): Promise<void> {
    const box = this._findBox(cmd.boxId);
    if (!canBotUseBox(box)) return;
    if (!isRangeFree(box.textEl, cmd.start, cmd.end, this.id)) return;
    try {
      await this.exec.dragSelect(box, cmd.start, cmd.end);
      if (!box.el.isConnected || isHumanFocusedBox(box)) return;
      this.exec.deleteRange(box);
      const spanIdx = this.lockSpan ? getSpanCharIndex(box.textEl, this.lockSpan) : cmd.start;
      this._renderCaret(box, spanIdx);
      await sleep(rand(30, 70));
      await this.exec.typeInto(box, cmd.text);
    } finally {
      this.hideOverlay();
      this.setMode("arrow");
    }
  }

  async _execDelete(cmd: Extract<Command, { type: "delete" }>): Promise<void> {
    const box = this._findBox(cmd.boxId);
    if (!canBotUseBox(box)) return;
    if (!isRangeFree(box.textEl, cmd.start, cmd.end, this.id)) return;
    try {
      await this.exec.dragSelect(box, cmd.start, cmd.end);
      if (!box.el.isConnected || isHumanFocusedBox(box)) return;
      this.exec.deleteRange(box);
      const spanIdx = this.lockSpan ? getSpanCharIndex(box.textEl, this.lockSpan) : cmd.start;
      this._renderCaret(box, spanIdx);
      await sleep(rand(40, 90));
    } finally {
      this.hideOverlay();
      this.setMode("arrow");
    }
  }

  async _execBackspace(cmd: Extract<Command, { type: "backspace" }>): Promise<void> {
    const box = this._findBox(cmd.boxId);
    if (!canBotUseBox(box)) return;
    if (!isRangeFree(box.textEl, Math.max(0, cmd.index - cmd.count), cmd.index, this.id)) return;
    try {
      await this.exec.placeCaret(box, cmd.index);
      await this.exec.backspace(box, cmd.count);
    } finally {
      this.hideOverlay();
      this.setMode("arrow");
    }
  }

  async _execMoveBox(cmd: Extract<Command, { type: "moveBox" }>): Promise<void> {
    const box = this._findBox(cmd.boxId);
    if (!canBotUseBox(box)) return;
    const boxRect = box.el.getBoundingClientRect();
    const cx = boxRect.left + boxRect.width / 2;
    const cy = boxRect.top + boxRect.height / 2;
    await this.exec.clickAt(cx, cy);
    box.el.classList.add("selected");
    await sleep(rand(60, 150));
    const r = this.ctx.wsRect();
    const startLeft = box.el.offsetLeft;
    const startTop = box.el.offsetTop;
    const steps = Math.max(10, Math.floor(rand(15, 30)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const curLeft = startLeft + (cmd.toX - startLeft) * ease;
      const curTop = startTop + (cmd.toY - startTop) * ease;
      box.el.style.left = `${curLeft}px`;
      box.el.style.top = `${curTop}px`;
      this.x = r.left + curLeft + boxRect.width / 2;
      this.y = r.top + curTop + boxRect.height / 2;
      this.updateCursor();
      await sleep(rand(8, 18));
    }
    moveBox(box, cmd.toX, cmd.toY);
    box.el.classList.remove("selected");
    await sleep(rand(30, 80));
  }

  async depart(): Promise<void> {
    this.hideOverlay();
    this.setMode("arrow");
    this.ctx.eventBus.off("edit", this._onEdit);
    const p = randomEdgePoint(this.ctx.wsRect());
    await this.exec.moveTo(p.x, p.y, "travel");
    this.cursor.remove();
    this.selEl.remove();
    this.caretEl.remove();
  }

  async loop(): Promise<void> {
    while (!this.retiring) {
      if (performance.now() - this.birth > this.maxLifetime && chance(BOT_RETIRE_CHECK_CHANCE)) {
        this.retiring = true;
        break;
      }
      await sleep(rand(ACTION_PAUSE_MIN, ACTION_PAUSE_MAX));
      try {
        const { cmd } = this.planner.plan({ boxes: this.ctx.boxes, botId: this.id, wsRect: this.ctx.wsRect });
        await this.executeCommand(cmd);
      } catch {
        // Ignore transient DOM conflicts between agents.
      }
    }
    try {
      await this.depart();
    } catch {
      // Ignore teardown failures during retirement.
    }
  }
}
