import type { EventBus } from "./types";

function playKeystroke(_ch: string): void {
  // TODO: play a keystroke click sound
}

function playDeleteSound(): void {
  // TODO: play a soft delete/backspace sound
}

export function initSound(eventBus: EventBus): void {
  eventBus.on("edit", ({ text, start, end }) => {
    if (text == null) return;
    if (text.length === 1) {
      playKeystroke(text);
    } else if (text.length > 1) {
      playKeystroke(text[0] ?? "");
    } else if (text === "" && start !== end) {
      playDeleteSound();
    }
  });
}
