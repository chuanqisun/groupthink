import { Bot } from "./components/bot";
import { FONT, createBox as createBoxEl, measureCharWidth, nextZIndex, placeCaretEnd, showClick } from "./components/edit";
import { createEventBus } from "./components/events";
import { INITIAL_BOTS, ecologyLoop } from "./components/pool";
import { createSoundEngine } from "./components/sound-simulator/engine";
import "./style.css";
import type { BotContext, Box, BoxElement } from "./types";

const workspaceEl = document.getElementById("workspace");
const cursorLayerEl = document.getElementById("cursorLayer");
const hintEl = document.getElementById("hint");

if (!(workspaceEl instanceof HTMLElement) || !(cursorLayerEl instanceof HTMLElement)) {
  throw new Error("Workspace root elements are missing.");
}

const workspace: HTMLElement = workspaceEl;
const cursorLayer: HTMLElement = cursorLayerEl;

function wsRect(): DOMRect {
  return workspace.getBoundingClientRect();
}

const eventBus = createEventBus();
const boxes: Box[] = [];
const bots = new Map<number, Bot>();
let boxSeq = 0;
let botSeq = 0;
const charW = measureCharWidth(FONT);

function createBox(left: number, top: number, text: string): Box {
  const box = createBoxEl(++boxSeq, left, top, text, workspace, eventBus);
  boxes.push(box);
  return box;
}

const botCtx: BotContext = { boxes, cursorLayer, charW, wsRect, createBox, eventBus };

function spawnBot(): void {
  const bot = new Bot(++botSeq, botCtx);
  bots.set(bot.id, bot);
  void bot.loop().finally(() => bots.delete(bot.id));
}

function activeBotCount(): number {
  return [...bots.values()].filter((bot) => !bot.retiring).length;
}

// Click animation (always active)
workspace.addEventListener("mousedown", (e) => {
  showClick(e.clientX, e.clientY, cursorLayer);
});

// Box selection & drag (always active)
let selectedBox: Box | null = null;
let dragging: { box: Box; offsetX: number; offsetY: number } | null = null;

function selectBox(box: Box | null): void {
  if (selectedBox && selectedBox !== box) selectedBox.el.classList.remove("selected");
  selectedBox = box;
  if (box) {
    box.el.classList.add("selected");
    box.el.style.zIndex = String(nextZIndex());
  }
}

workspace.addEventListener("mousedown", (e) => {
  const boxEl = (e.target as Element | null)?.closest(".box") as BoxElement | null;
  if (!boxEl) {
    if (selectedBox) {
      selectedBox.el.classList.remove("selected");
      selectedBox = null;
    }
    return;
  }

  const box = boxEl._box;
  if (!box) return;
  selectBox(box);

  const rect = boxEl.getBoundingClientRect();
  const mx = e.clientX;
  const my = e.clientY;
  const insetL = mx - rect.left;
  const insetR = rect.right - mx;
  const insetT = my - rect.top;
  const insetB = rect.bottom - my;
  const edge = 10;
  const nearBorder = insetL < edge || insetR < edge || insetT < edge || insetB < edge;
  if (nearBorder) {
    e.preventDefault();
    dragging = { box, offsetX: mx - rect.left, offsetY: my - rect.top };
  }
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const r = wsRect();
  const newLeft = e.clientX - r.left - dragging.offsetX;
  const newTop = e.clientY - r.top - dragging.offsetY;
  dragging.box.el.style.left = `${newLeft}px`;
  dragging.box.el.style.top = `${newTop}px`;
});

window.addEventListener("mouseup", () => {
  dragging = null;
});

// Helper: create a text box from a click event
function handleBoxClick(e: MouseEvent): void {
  if (e.target !== workspace) return;
  const r = wsRect();
  const box = createBox(e.clientX - r.left, e.clientY - r.top, "");
  box.textEl.focus();
  placeCaretEnd(box.textEl);
}

// ── Async initialisation: load sounds → wait for click → spawn bots ─────────
(async () => {
  // 1. Show loading state
  if (hintEl) hintEl.textContent = "Waiting for collaborators to join\u2026";

  // 2. Pre-load all audio assets into buffers
  const soundEngine = await createSoundEngine();
  botCtx.soundEngine = soundEngine;

  // 3. Assets ready – prompt the user to click
  if (hintEl) hintEl.textContent = "Click to create text";

  // 4. Wait for the first click to unlock the AudioContext (user-gesture requirement)
  await new Promise<void>((resolve) => {
    workspace.addEventListener(
      "click",
      function startHandler(e: MouseEvent) {
        soundEngine.start();
        if (hintEl) hintEl.remove();
        handleBoxClick(e);
        resolve();
      },
      { once: true }
    );
  });

  // 5. Register persistent box-creation handler for subsequent clicks
  workspace.addEventListener("click", handleBoxClick);

  // 6. Start spawning bots
  for (let i = 0; i < INITIAL_BOTS; i++) {
    window.setTimeout(spawnBot, i * 150);
  }
  void ecologyLoop({
    activeBotCount,
    spawnBot,
    getActiveBots: () => [...bots.values()].filter((bot) => !bot.retiring),
  });
})();
