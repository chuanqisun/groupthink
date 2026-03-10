import { chance, rand } from "./timing";

function choice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

export const WORDS = [
  "human",
  "bot",
  "shared",
  "space",
  "cursor",
  "draft",
  "edit",
  "text",
  "hello",
  "note",
  "tiny",
  "blue",
  "random",
  "growing",
  "canvas",
  "alive",
  "typing",
  "select",
  "delete",
  "replace",
  "move",
  "click",
  "future",
  "signal",
  "paper",
  "soft",
  "prompt",
  "idea",
  "loop",
  "trace",
  "shape",
  "pixel",
  "small",
  "story",
  "marker",
  "world",
  "flow",
  "plain",
  "quick",
  "slow",
  "thought",
  "field",
  "line",
  "window",
] as const;

export function randomWords(min = 1, max = 3): string {
  const n = Math.floor(rand(min, max + 1));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(choice(WORDS));
  return out.join(" ");
}

export function randomPhrase(min?: number, max?: number): string {
  let s = randomWords(min, max);
  if (chance(0.22)) s += choice([".", "?", "!", "..."]);
  return s;
}

export function appendChunk(current: string): string {
  let s = randomPhrase(1, chance(0.5) ? 2 : 4);
  if (current && !/\s$/.test(current) && /^[a-z]/i.test(s)) s = " " + s;
  return s;
}

export function insertChunk(text: string, index: number): string {
  const safeText = text || "";
  const safeIndex = index ?? safeText.length;
  const before = safeIndex > 0 ? safeText[safeIndex - 1] ?? "" : "";
  const after = safeIndex < safeText.length ? safeText[safeIndex] ?? "" : "";

  let chunk = randomWords(1, 2);

  if (safeIndex > 0 && /[\w.,!?;:…]/.test(before)) {
    chunk = " " + chunk;
  }
  if (safeIndex < safeText.length && /\w/.test(after)) {
    chunk += " ";
  }
  if (/\s/.test(before) && chunk.startsWith(" ")) {
    chunk = chunk.slice(1);
  }
  if (/\s/.test(after) && chunk.endsWith(" ")) {
    chunk = chunk.slice(0, -1);
  }

  return chunk;
}

export function wordBoundaries(text: string): number[] {
  const bounds = new Set<number>([0, text.length]);
  for (let i = 1; i < text.length; i++) {
    const prev = /\w/.test(text[i - 1] ?? "");
    const curr = /\w/.test(text[i] ?? "");
    if (prev !== curr) bounds.add(i);
  }
  return [...bounds].sort((a, b) => a - b);
}

export function snapToWordBoundary(text: string, index: number): number {
  const bounds = wordBoundaries(text);
  let best = bounds[0] ?? 0;
  for (const b of bounds) {
    if (Math.abs(b - index) < Math.abs(best - index)) best = b;
  }
  return best;
}

export function pickRange(text: string): [number, number] {
  if (!text.length) return [0, 0];
  const matches = [...text.matchAll(/[A-Za-z0-9']+[.,!?;:…]*/g)];
  if (matches.length && chance(0.75)) {
    const i0 = Math.floor(rand(0, matches.length));
    const span = Math.floor(rand(1, Math.min(3, matches.length - i0) + 1));
    const startM = matches[i0];
    const endM = matches[i0 + span - 1];
    if (!startM || !endM || startM.index == null || endM.index == null) {
      return [0, text.length];
    }
    return [startM.index, endM.index + endM[0].length];
  }

  const bounds = wordBoundaries(text);
  if (bounds.length >= 2) {
    const i = Math.floor(rand(0, bounds.length - 1));
    const j = Math.floor(rand(i + 1, Math.min(bounds.length, i + 4)));
    return [bounds[i] ?? 0, bounds[j] ?? text.length];
  }
  return [0, text.length];
}
