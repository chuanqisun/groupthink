export const LOCK_CARET = "caret";
export const LOCK_SELECTION = "selection";

function findTextPosition(el: HTMLElement, charIndex: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    if (pos + node.length >= charIndex) {
      return { node, offset: charIndex - pos };
    }
    pos += node.length;
  }
  return null;
}

export function getSpanCharIndex(textEl: HTMLElement, span: HTMLSpanElement): number {
  const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
  let pos = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    if (span.contains(node)) return pos;
    pos += node.length;
  }

  const iter = document.createNodeIterator(textEl, NodeFilter.SHOW_ALL);
  pos = 0;
  let node: Node | null;
  while ((node = iter.nextNode())) {
    if (node === span) return pos;
    if (node.nodeType === Node.TEXT_NODE && !span.contains(node)) {
      pos += (node.textContent ?? "").length;
    }
  }
  return pos;
}

export function acquireCaretLock(textEl: HTMLElement, index: number, botId: number): HTMLSpanElement | null {
  releaseLock(textEl, botId);
  if (!isRangeFree(textEl, index, index, botId)) return null;

  const span = document.createElement("span");
  span.className = "bot-lock";
  span.dataset.botId = String(botId);
  span.dataset.lockType = LOCK_CARET;

  const tp = findTextPosition(textEl, index);
  if (tp) {
    const parent = tp.node.parentNode;
    if (!parent) return null;
    if (tp.offset === 0) {
      parent.insertBefore(span, tp.node);
    } else if (tp.offset >= tp.node.length) {
      parent.insertBefore(span, tp.node.nextSibling);
    } else {
      const after = tp.node.splitText(tp.offset);
      parent.insertBefore(span, after);
    }
  } else {
    textEl.appendChild(span);
  }
  return span;
}

export function acquireSelectionLock(textEl: HTMLElement, start: number, end: number, botId: number): HTMLSpanElement | null {
  releaseLock(textEl, botId);

  if (start > end) [start, end] = [end, start];
  if (start === end) return acquireCaretLock(textEl, start, botId);
  if (!isRangeFree(textEl, start, end, botId)) return null;

  const startPos = findTextPosition(textEl, start);
  const endPos = findTextPosition(textEl, end);
  if (!startPos || !endPos) return acquireCaretLock(textEl, start, botId);

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  const span = document.createElement("span");
  span.className = "bot-lock";
  span.dataset.botId = String(botId);
  span.dataset.lockType = LOCK_SELECTION;

  try {
    range.surroundContents(span);
  } catch {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }
  textEl.normalize();
  return span;
}

export function releaseLock(textEl: HTMLElement, botId: number): void {
  const span = textEl.querySelector(`.bot-lock[data-bot-id="${botId}"]`);
  if (!(span instanceof HTMLSpanElement) || !span.parentNode) return;
  while (span.firstChild) {
    span.parentNode.insertBefore(span.firstChild, span);
  }
  span.remove();
  textEl.normalize();
}

export function releaseAllLocks(textEl: HTMLElement): void {
  const spans = [...textEl.querySelectorAll(".bot-lock")];
  for (const span of spans) {
    if (!(span instanceof HTMLSpanElement) || !span.parentNode) continue;
    while (span.firstChild) {
      span.parentNode.insertBefore(span.firstChild, span);
    }
    span.remove();
  }
  textEl.normalize();
}

export function getLockSpan(textEl: HTMLElement, botId: number): HTMLSpanElement | null {
  const span = textEl.querySelector(`.bot-lock[data-bot-id="${botId}"]`);
  return span instanceof HTMLSpanElement ? span : null;
}

function isPointInsideText(start: number, sStart: number, sEnd: number): boolean {
  return start >= sStart && start < sEnd;
}

function doesRangeOverlapText(start: number, end: number, sStart: number, sEnd: number): boolean {
  return start < sEnd && end > sStart;
}

export function isRangeFree(textEl: HTMLElement, start: number, end: number, excludeBotId: number): boolean {
  const spans = textEl.querySelectorAll(".bot-lock");
  for (const span of spans) {
    if (!(span instanceof HTMLSpanElement)) continue;
    if (span.dataset.botId === String(excludeBotId)) continue;
    const sStart = getSpanCharIndex(textEl, span);
    const sEnd = sStart + (span.textContent?.length ?? 0);
    const caretIndex = span.dataset.lockType === LOCK_CARET ? sEnd : null;

    if (start === end) {
      if (isPointInsideText(start, sStart, sEnd)) {
        return false;
      }
      if (caretIndex !== null && start === caretIndex) {
        return false;
      }
    } else if (doesRangeOverlapText(start, end, sStart, sEnd)) {
      return false;
    } else if (caretIndex !== null && start <= caretIndex && caretIndex < end) {
      return false;
    }
  }
  return true;
}
