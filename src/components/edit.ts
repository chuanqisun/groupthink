import { Doc } from "./document";
import { releaseAllLocks } from "./locks";
import type { Box, BoxElement, EventBus } from "./types";

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function normalizeText(s: string | null | undefined): string {
  return (s || "").replace(/\r\n/g, "\n");
}

export function indexToRowCol(text: string, index: number): { row: number; col: number } {
  let row = 0;
  let col = 0;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") {
      row++;
      col = 0;
    } else {
      col++;
    }
  }
  return { row, col };
}

export const PAD_X = 6;
export const PAD_Y = 5;
export const LINE_H = 28;
export const FONT = "22px monospace";

export function measureCharWidth(font: string): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return 12;
  }
  ctx.font = font || FONT;
  return ctx.measureText("M").width;
}

export function getText(box: Box): string {
  let text = box.textEl.textContent || "";
  if (text.endsWith("\u200B")) text = text.slice(0, -1);
  return text;
}

export function syncDocText(box: Box): void {
  box.doc.text = getText(box);
}

function syncTextEl(box: Box): void {
  const text = box.doc.text;
  box.textEl.textContent = text.endsWith("\n") ? text + "\u200B" : text;
}

export function safeSyncTextEl(box: Box): void {
  if (!box.textEl.querySelector(".bot-lock")) {
    syncTextEl(box);
  }
}

export function setText(box: Box, text: string): void {
  box.doc.text = normalizeText(text);
  syncTextEl(box);
}

export function applyEdit(box: Box, start: number, end: number, insertText: string): number {
  const newPos = box.doc.apply(start, end, insertText);
  syncTextEl(box);
  return newPos;
}

export function pagePointForIndex(box: Box, index: number, charW: number): { x: number; y: number } {
  const rect = box.textEl.getBoundingClientRect();
  const text = getText(box);
  const clampedIndex = clamp(index, 0, text.length);
  const { row, col } = indexToRowCol(text, clampedIndex);
  return { x: rect.left + PAD_X + charW * col + 1, y: rect.top + PAD_Y + LINE_H * row + LINE_H * 0.55 };
}

export function isHumanFocusedBox(box: Box): boolean {
  const ae = document.activeElement;
  return !!(ae instanceof HTMLElement && ae.closest(".box") === box.el);
}

export function canBotUseBox(box: Box | undefined): box is Box {
  return !!box && box.el.isConnected && !isHumanFocusedBox(box);
}

export function showClick(x: number, y: number, cursorLayer: HTMLElement): void {
  const d = document.createElement("div");
  d.className = "click";
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  cursorLayer.appendChild(d);
  window.setTimeout(() => d.remove(), 260);
}

export function insertTextAtSelection(text: string): void {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function placeCaretEnd(el: HTMLElement): void {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

export function scrubEditable(_el: HTMLElement): void {}

export function moveBox(box: Box, left: number, top: number): void {
  box.el.style.left = `${left}px`;
  box.el.style.top = `${top}px`;
  box.el.style.zIndex = String(nextZIndex());
}

function getSelectionOffsets(el: HTMLElement, maxLen: number): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);

  function offsetIn(container: HTMLElement, node: Node, off: number): number {
    let count = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const currentNode = walker.currentNode;
      if (!(currentNode instanceof Text)) continue;
      if (currentNode === node) return count + off;
      count += currentNode.length;
    }
    return count;
  }

  let start = offsetIn(el, range.startContainer, range.startOffset);
  let end = offsetIn(el, range.endContainer, range.endOffset);
  start = Math.min(start, maxLen);
  end = Math.min(end, maxLen);
  return { start, end };
}

function setCaretOffset(el: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    if (pos + node.length >= offset) {
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.setStart(node, offset - pos);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    pos += node.length;
  }
  placeCaretEnd(el);
}

export function createBox(id: number, left: number, top: number, text: string, workspace: HTMLElement, eventBus?: EventBus): Box {
  const r = workspace.getBoundingClientRect();
  left = clamp(left, 6, Math.max(6, r.width - 40));
  top = clamp(top, 6, Math.max(6, r.height - 36));

  const box: Box = {
    id,
    doc: new Doc(normalizeText(text || "")),
    el: document.createElement("div"),
    textEl: document.createElement("div"),
  };
  box.el.className = "box";
  (box.el as BoxElement)._box = box;
  box.el.style.left = `${left}px`;
  box.el.style.top = `${top}px`;
  box.textEl.className = "text";
  box.textEl.contentEditable = "true";
  box.textEl.spellcheck = false;
  box.textEl.textContent = text || "";

  box.textEl.addEventListener("beforeinput", (event) => {
    const e = event as InputEvent & { dataTransfer?: DataTransfer | null };
    if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {
      e.preventDefault();
      const offsets = getSelectionOffsets(box.textEl, box.doc.text.length);
      if (!offsets) return;
      const newPos = applyEdit(box, offsets.start, offsets.end, "\n");
      setCaretOffset(box.textEl, newPos);
      eventBus?.emit("edit", { boxId: box.id, start: offsets.start, end: offsets.end, text: "\n", newPos });
      return;
    }

    const offsets = getSelectionOffsets(box.textEl, box.doc.text.length);
    if (!offsets) return;

    if (e.inputType === "insertText" || e.inputType === "insertCompositionText") {
      const insertText = normalizeText(e.data || "");
      if (!insertText) return;
      e.preventDefault();
      const newPos = applyEdit(box, offsets.start, offsets.end, insertText);
      setCaretOffset(box.textEl, newPos);
      eventBus?.emit("edit", { boxId: box.id, start: offsets.start, end: offsets.end, text: insertText, newPos });
      return;
    }

    if (e.inputType === "deleteContentBackward") {
      e.preventDefault();
      const start = offsets.start === offsets.end ? Math.max(0, offsets.start - 1) : Math.min(offsets.start, offsets.end);
      const end = Math.max(offsets.start, offsets.end);
      if (start === end) return;
      const newPos = applyEdit(box, start, end, "");
      setCaretOffset(box.textEl, newPos);
      eventBus?.emit("edit", { boxId: box.id, start, end, text: "", newPos });
      return;
    }

    if (e.inputType === "deleteContentForward") {
      e.preventDefault();
      const start = Math.min(offsets.start, offsets.end);
      const end = offsets.start === offsets.end ? Math.min(box.doc.text.length, offsets.end + 1) : Math.max(offsets.start, offsets.end);
      if (start === end) return;
      const newPos = applyEdit(box, start, end, "");
      setCaretOffset(box.textEl, newPos);
      eventBus?.emit("edit", { boxId: box.id, start, end, text: "", newPos });
      return;
    }

    if (
      e.inputType === "deleteByCut" ||
      e.inputType === "deleteWordBackward" ||
      e.inputType === "deleteWordForward" ||
      e.inputType === "deleteSoftLineBackward" ||
      e.inputType === "deleteSoftLineForward"
    ) {
      e.preventDefault();
      const start = Math.min(offsets.start, offsets.end);
      const end = Math.max(offsets.start, offsets.end);
      if (start === end) return;
      const newPos = applyEdit(box, start, end, "");
      setCaretOffset(box.textEl, newPos);
      eventBus?.emit("edit", { boxId: box.id, start, end, text: "", newPos });
      return;
    }

    if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") {
      e.preventDefault();
      const raw = e.dataTransfer?.getData("text/plain") || "";
      const insertText = normalizeText(raw);
      if (!insertText) return;
      const newPos = applyEdit(box, offsets.start, offsets.end, insertText);
      setCaretOffset(box.textEl, newPos);
      eventBus?.emit("edit", { boxId: box.id, start: offsets.start, end: offsets.end, text: insertText, newPos });
    }
  });

  box.textEl.addEventListener("input", () => scrubEditable(box.textEl));
  box.textEl.addEventListener("focus", () => {
    releaseAllLocks(box.textEl);
    syncDocText(box);
    syncTextEl(box);
    box.el.style.zIndex = String(nextZIndex());
  });

  box.el.appendChild(box.textEl);
  workspace.appendChild(box.el);
  return box;
}

let _zCounter = 1;
export function nextZIndex(): number {
  return ++_zCounter;
}

export function findOpenSpot(boxes: Box[], rect: DOMRect): { x: number; y: number } {
  let best: { x: number; y: number; score: number } | null = null;
  for (let i = 0; i < 40; i++) {
    const x = rand(10, Math.max(10, rect.width - 150));
    const y = rand(10, Math.max(10, rect.height - 40));
    let score = rand(0, 30);
    for (const box of boxes) {
      if (!box.el.isConnected) continue;
      const bx = box.el.offsetLeft;
      const by = box.el.offsetTop;
      const bw = Math.max(90, box.el.offsetWidth);
      const bh = Math.max(30, box.el.offsetHeight);
      const ox = Math.max(0, Math.min(x + 140, bx + bw) - Math.max(x, bx));
      const oy = Math.max(0, Math.min(y + 34, by + bh) - Math.max(y, by));
      score -= ox * oy * 3;
      score += Math.min(200, Math.hypot(x + 70 - (bx + bw / 2), y + 17 - (by + bh / 2)));
    }
    if (!best || score > best.score) best = { x, y, score };
  }
  return best ? { x: best.x, y: best.y } : { x: 20, y: 20 };
}
