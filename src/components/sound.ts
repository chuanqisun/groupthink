import type { SoundPlayer } from "./types";
import { soundmap } from "./sound-simulator/config";
import keyboardSpriteUrl from "./sound-simulator/keyboard-sound-sprite.mp3";
import click01Url from "./sound-simulator/mouse-sounds/click-01.mp3";
import click02Url from "./sound-simulator/mouse-sounds/click-02.mp3";
import click03Url from "./sound-simulator/mouse-sounds/click-03.mp3";
import click04Url from "./sound-simulator/mouse-sounds/click-04.mp3";

/**
 * Map printable characters and special keys to scan-code numbers
 * used in the keyboard-sound-sprite config.
 */
const charToKeycode: Record<string, number> = {
  "`": 41, "~": 41,
  "1": 2, "!": 2,
  "2": 3, "@": 3,
  "3": 4, "#": 4,
  "4": 5, "$": 5,
  "5": 6, "%": 6,
  "6": 7, "^": 7,
  "7": 8, "&": 8,
  "8": 9, "*": 9,
  "9": 10, "(": 10,
  "0": 11, ")": 11,
  "-": 12, "_": 12,
  "=": 13, "+": 13,
  a: 30, A: 30, b: 48, B: 48, c: 46, C: 46,
  d: 32, D: 32, e: 18, E: 18, f: 33, F: 33,
  g: 34, G: 34, h: 35, H: 35, i: 23, I: 23,
  j: 36, J: 36, k: 37, K: 37, l: 38, L: 38,
  m: 50, M: 50, n: 49, N: 49, o: 24, O: 24,
  p: 25, P: 25, q: 16, Q: 16, r: 19, R: 19,
  s: 31, S: 31, t: 20, T: 20, u: 22, U: 22,
  v: 47, V: 47, w: 17, W: 17, x: 45, X: 45,
  y: 21, Y: 21, z: 44, Z: 44,
  "[": 26, "{": 26, "]": 27, "}": 27, "\\": 43, "|": 43,
  ";": 39, ":": 39, "'": 40, '"': 40,
  ",": 51, "<": 51, ".": 52, ">": 52, "/": 53, "?": 53,
  " ": 57, "\n": 28, "\t": 15,
};

const BACKSPACE_KEYCODE = 14;
const FALLBACK_KEYCODE = 57; // Space key as fallback

const MOUSE_URLS = [click01Url, click02Url, click03Url, click04Url];

export class SoundEngine implements SoundPlayer {
  private ctx: AudioContext;
  private keyboardBuffer: AudioBuffer | null = null;
  private mouseBuffers: AudioBuffer[] = [];
  private started = false;

  constructor() {
    this.ctx = new AudioContext();
  }

  /** Fetch and decode all audio assets into ready-to-play buffers. */
  async load(): Promise<void> {
    const urls = [keyboardSpriteUrl, ...MOUSE_URLS];
    const arrayBuffers = await Promise.all(urls.map((u) => fetch(u).then((r) => r.arrayBuffer())));
    const audioBuffers = await Promise.all(arrayBuffers.map((ab) => this.ctx.decodeAudioData(ab)));
    this.keyboardBuffer = audioBuffers[0]!;
    this.mouseBuffers = audioBuffers.slice(1);
  }

  /** Resume the AudioContext (requires user gesture on the web). */
  async start(): Promise<void> {
    if (this.started) return;
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    this.started = true;
  }

  /** Play the keyboard sound for a character. Falls back to space key sound. */
  playKeystroke(ch: string): void {
    if (!this.keyboardBuffer || !this.started) return;
    const keycode = ch === "\b" ? BACKSPACE_KEYCODE : charToKeycode[ch];
    const map = soundmap as Record<string, number[] | undefined>;
    const entry = keycode != null ? map[String(keycode)] : null;
    const fallback = map[String(FALLBACK_KEYCODE)]!;
    const [offsetMs, durationMs] = entry ?? fallback;
    const source = this.ctx.createBufferSource();
    source.buffer = this.keyboardBuffer;
    source.connect(this.ctx.destination);
    source.start(0, offsetMs / 1000, durationMs / 1000);
  }

  /** Play a mouse click sound by index (0-3). */
  playMouseClick(index: number): void {
    const buffer = this.mouseBuffers[index];
    if (!buffer || !this.started) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start();
  }
}
