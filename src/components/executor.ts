import { isHumanFocusedBox, nextZIndex, pagePointForIndex, showClick, syncDocText } from "./edit";
import { humanKeyDelay } from "./keyboard";
import { getLockProtectedRange, getSpanCharIndex, LOCK_CARET, setLockProtectedRange } from "./locks";
import { moveHumanLike } from "./movement";
import { chance, clamp, rand, sleep } from "./timing";
import type { BotContext, Box, CursorAgent, EventBus, Precision } from "./types";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const SETTLE_BEFORE_CLICK_MIN = 8;
const SETTLE_BEFORE_CLICK_MAX = 35;
const SETTLE_AFTER_CLICK_MIN = 15;
const SETTLE_AFTER_CLICK_MAX = 50;
const CARET_SETTLE_MIN = 20;
const CARET_SETTLE_MAX = 60;
const BS_MIN = 25;
const BS_MAX = 65;
const BS_HESITATE_CHANCE = 0.12;
const BS_HESITATE_MIN = 25;
const BS_HESITATE_MAX = 60;
const DRAG_STEP_MIN = 5;
const DRAG_STEP_MAX = 14;
const DRAG_PAUSE_CHANCE = 0.1;
const DRAG_PAUSE_MIN = 8;
const DRAG_PAUSE_MAX = 30;

export class Executor {
  agent: CursorAgent;
  ctx: BotContext;
  bus: EventBus | null;
  clickSoundIndex: number;

  constructor(agent: CursorAgent, ctx: BotContext, clickSoundIndex: number) {
    this.agent = agent;
    this.ctx = ctx;
    this.bus = ctx.eventBus || null;
    this.clickSoundIndex = clickSoundIndex;
  }

  _emitEdit(box: Box): void {
    this.bus?.emit("edit", { boxId: box.id });
  }

  private _clickWithSound(x: number, y: number): void {
    showClick(x, y, this.ctx.cursorLayer);
    this.ctx.soundEngine?.playMouseClick(this.clickSoundIndex);
  }

  async moveTo(x: number, y: number, precision: Precision): Promise<void> {
    await moveHumanLike(this.agent, x, y, precision);
  }

  async clickAt(x: number, y: number): Promise<void> {
    this.agent.setMode("arrow");
    await this.moveTo(x, y, "click");
    await sleep(rand(SETTLE_BEFORE_CLICK_MIN, SETTLE_BEFORE_CLICK_MAX));
    this._clickWithSound(x, y);
    await sleep(rand(SETTLE_AFTER_CLICK_MIN, SETTLE_AFTER_CLICK_MAX));
  }

  async placeCaret(box: Box, index: number, options?: { preserveLock?: boolean }): Promise<void> {
    if (!box.el.isConnected) return;
    const p = pagePointForIndex(box, index, this.ctx.charW);
    this.agent.setMode("arrow");
    await this.moveTo(p.x, p.y, "text");
    await sleep(rand(SETTLE_BEFORE_CLICK_MIN, SETTLE_BEFORE_CLICK_MAX));
    this.agent.setMode("ibeam");
    this._clickWithSound(p.x, p.y);
    box.el.style.zIndex = String(nextZIndex());
    if (!options?.preserveLock) {
      this.agent.showCaret(box, index);
    }
    await sleep(rand(CARET_SETTLE_MIN, CARET_SETTLE_MAX));
  }

  async dragSelect(box: Box, start: number, end: number): Promise<void> {
    if (!box.el.isConnected) return;
    if (end < start) [start, end] = [end, start];
    const p0 = pagePointForIndex(box, start, this.ctx.charW);
    this.agent.setMode("ibeam");
    await this.moveTo(p0.x, p0.y, "text");
    await sleep(rand(10, 35));
    this._clickWithSound(p0.x, p0.y);
    await sleep(rand(15, 40));

    const steps = Math.max(8, (end - start) * 3);
    for (let i = 0; i <= steps; i++) {
      if (!box.el.isConnected || isHumanFocusedBox(box)) return;
      const t = i / steps;
      const skew = t < 0.2 ? t * 1.8 : t < 0.75 ? 0.36 + (t - 0.2) * 0.9 : 0.86 + (t - 0.75) * 0.56;
      const idx = Math.round(start + (end - start) * clamp(skew, 0, 1));
      const p = pagePointForIndex(box, idx, this.ctx.charW);
      this.agent.x = lerp(this.agent.x, p.x, rand(0.6, 1));
      this.agent.y = lerp(this.agent.y, p.y, rand(0.6, 1));
      this.agent.updateCursor();
      if (chance(DRAG_PAUSE_CHANCE)) await sleep(rand(DRAG_PAUSE_MIN, DRAG_PAUSE_MAX));
      await sleep(rand(DRAG_STEP_MIN, DRAG_STEP_MAX));
    }
    this.agent.showSelection(box, start, end);
    await sleep(rand(30, 70));
  }

  async typeInto(box: Box, text: string): Promise<void> {
    const lockSpan = this.agent.lockSpan;
    if (!lockSpan) return;

    let prev = "";
    this.agent.setMode("ibeam");

    for (const ch of text) {
      if (this.agent.retiring || !box.el.isConnected || isHumanFocusedBox(box)) break;
      this.ctx.soundEngine?.playKeystroke(ch);
      lockSpan.textContent = (lockSpan.textContent ?? "") + ch;
      const spanStart = getSpanCharIndex(box.textEl, lockSpan);
      setLockProtectedRange(lockSpan, spanStart, spanStart + (lockSpan.textContent?.length ?? 0));
      syncDocText(box);
      this._emitEdit(box);
      await sleep(humanKeyDelay(ch, prev));
      prev = ch;
    }
  }

  async backspace(box: Box, count: number): Promise<void> {
    const lockSpan = this.agent.lockSpan;
    if (!lockSpan) return;

    this.agent.setMode("ibeam");

    const isSelectionLock = lockSpan.dataset.lockType !== LOCK_CARET;
    const protectedRange = getLockProtectedRange(box.textEl, lockSpan);
    setLockProtectedRange(lockSpan, protectedRange.start, protectedRange.end);

    for (let i = 0; i < count; i++) {
      if (this.agent.retiring || !box.el.isConnected || isHumanFocusedBox(box)) break;
      this.ctx.soundEngine?.playKeystroke("\b");
      if (isSelectionLock) {
        const lockedText = lockSpan.textContent ?? "";
        if (!lockedText.length) break;
        lockSpan.textContent = lockedText.slice(0, -1);
      } else {
        const prev = lockSpan.previousSibling;
        if (!(prev instanceof Text) || prev.length === 0) {
          break;
        }
        if (prev.parentElement?.closest(".bot-lock")) break;
        prev.textContent = (prev.textContent ?? "").slice(0, -1);
        if (prev.length === 0) prev.remove();
      }
      syncDocText(box);
      this._emitEdit(box);
      if (isSelectionLock) {
        if (!lockSpan.textContent?.length) {
          lockSpan.dataset.lockType = LOCK_CARET;
        }
      }
      let ms = rand(BS_MIN, BS_MAX);
      if (chance(BS_HESITATE_CHANCE)) ms += rand(BS_HESITATE_MIN, BS_HESITATE_MAX);
      await sleep(ms);
    }

    if (isSelectionLock && lockSpan.dataset.lockType !== LOCK_CARET) {
      lockSpan.dataset.lockType = LOCK_CARET;
    }
  }

  deleteRange(box: Box): void {
    const lockSpan = this.agent.lockSpan;
    if (!lockSpan) return;
    this.ctx.soundEngine?.playKeystroke("\b");
    const protectedRange = getLockProtectedRange(box.textEl, lockSpan);
    setLockProtectedRange(lockSpan, protectedRange.start, protectedRange.end);
    lockSpan.textContent = "";
    lockSpan.dataset.lockType = LOCK_CARET;
    syncDocText(box);
    this._emitEdit(box);
  }
}
