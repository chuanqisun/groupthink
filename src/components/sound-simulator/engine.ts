import type { SoundEngine } from "../../types";
import { soundmap } from "./config";

const MOUSE_CLICK_COUNT = 4;

/**
 * Maps printable characters (and a few control chars) to standard keycodes
 * so we can look up the correct sprite region in the keyboard sound map.
 */
const charToKeycode: Record<string, number> = {};

(function buildMap() {
  // Letters
  const letters: [string, number][] = [
    ["a", 30],
    ["b", 48],
    ["c", 46],
    ["d", 32],
    ["e", 18],
    ["f", 33],
    ["g", 34],
    ["h", 35],
    ["i", 23],
    ["j", 36],
    ["k", 37],
    ["l", 38],
    ["m", 50],
    ["n", 49],
    ["o", 24],
    ["p", 25],
    ["q", 16],
    ["r", 19],
    ["s", 31],
    ["t", 20],
    ["u", 22],
    ["v", 47],
    ["w", 17],
    ["x", 45],
    ["y", 21],
    ["z", 44],
  ];
  for (const [ch, kc] of letters) {
    charToKeycode[ch] = kc;
    charToKeycode[ch.toUpperCase()] = kc;
  }

  // Number row
  const nums: [string, number][] = [
    ["1", 2],
    ["2", 3],
    ["3", 4],
    ["4", 5],
    ["5", 6],
    ["6", 7],
    ["7", 8],
    ["8", 9],
    ["9", 10],
    ["0", 11],
  ];
  for (const [ch, kc] of nums) charToKeycode[ch] = kc;

  // Shifted number row (same physical keys)
  const shiftedNums: [string, number][] = [
    ["!", 2],
    ["@", 3],
    ["#", 4],
    ["$", 5],
    ["%", 6],
    ["^", 7],
    ["&", 8],
    ["*", 9],
    ["(", 10],
    [")", 11],
  ];
  for (const [ch, kc] of shiftedNums) charToKeycode[ch] = kc;

  // Punctuation — unshifted and shifted share the same key
  const punct: [string, string, number][] = [
    ["-", "_", 12],
    ["=", "+", 13],
    ["[", "{", 26],
    ["]", "}", 27],
    ["\\", "|", 43],
    [";", ":", 39],
    ["'", '"', 40],
    [",", "<", 51],
    [".", ">", 52],
    ["/", "?", 53],
    ["`", "~", 41],
  ];
  for (const [ch, shifted, kc] of punct) {
    charToKeycode[ch] = kc;
    charToKeycode[shifted] = kc;
  }

  // Special keys
  charToKeycode[" "] = 57; // Space
  charToKeycode["\n"] = 28; // Enter
  charToKeycode["\t"] = 15; // Tab
  charToKeycode["\b"] = 14; // Backspace
})();

const FALLBACK_KEYCODE = 57; // Space sound as fallback for unmapped chars

const sm: Record<string, [number, number]> = soundmap as unknown as Record<string, [number, number]>;

async function fetchAndDecode(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Creates and returns a SoundEngine after pre-loading every audio asset into
 * AudioBuffers.  Playback is instant – each call creates a one-shot
 * AudioBufferSourceNode so multiple sounds can overlap freely.
 *
 * The AudioContext is created immediately (will be "suspended" without a user
 * gesture).  Call `engine.start()` from inside a click / keydown handler to
 * resume it.
 */
export async function createSoundEngine(): Promise<SoundEngine> {
  const audioCtx = new AudioContext();

  // Resolve asset URLs through Vite so they work after bundling
  const keyboardSpriteUrl = new URL("./keyboard-sound-sprite.mp3", import.meta.url).href;
  const mouseClickUrls = Array.from(
    { length: MOUSE_CLICK_COUNT },
    (_, i) => new URL(`./mouse-sounds/click-${String(i + 1).padStart(2, "0")}.mp3`, import.meta.url).href
  );

  // Fetch and decode all assets in parallel
  const [keyboardBuffer, ...mouseBuffers] = await Promise.all([
    fetchAndDecode(audioCtx, keyboardSpriteUrl),
    ...mouseClickUrls.map((url) => fetchAndDecode(audioCtx, url)),
  ]);

  let _started = false;

  function playKey(char: string): void {
    if (!_started) return;
    const keycode = charToKeycode[char] ?? FALLBACK_KEYCODE;
    const sprite = sm[String(keycode)];
    if (!sprite) return;
    const [offsetMs, durationMs] = sprite;
    const source = audioCtx.createBufferSource();
    source.buffer = keyboardBuffer;
    source.connect(audioCtx.destination);
    source.start(0, offsetMs / 1000, durationMs / 1000);
  }

  function playMouseClick(clickIndex: number): void {
    if (!_started) return;
    const buffer = mouseBuffers[clickIndex % MOUSE_CLICK_COUNT];
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  }

  return {
    start() {
      void audioCtx.resume();
      _started = true;
    },
    playKey,
    playMouseClick,
    get started() {
      return _started;
    },
  };
}
