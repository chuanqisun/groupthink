/**
 * Grammar production rules for incremental sentence evolution.
 *
 * Each production rule makes one small edit to a text string.
 * Rules are designed to be granular: one bot applies one rule at a time.
 * When compounded across many bots and iterations, rich text emerges.
 *
 * The module uses a Dictionary (POS-indexed) to pick words that are
 * grammatically plausible while maintaining randomness.
 */

import type { Dictionary } from "./dictionary";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function choice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function chance(p: number): boolean {
  return Math.random() < p;
}

/** Get word match objects from text. */
function getWords(text: string): Array<{ word: string; start: number; end: number }> {
  const result: Array<{ word: string; start: number; end: number }> = [];
  const regex = /[A-Za-z0-9']+/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    result.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Seed creation (1-3 words)                                          */
/* ------------------------------------------------------------------ */

/**
 * Create seed text: a single word or short phrase (never > 3 words).
 * Uses POS-aware patterns for grammatical plausibility.
 */
export function createSeed(dict: Dictionary): string {
  const patterns: Array<() => string | undefined> = [
    // Single noun
    () => dict.random("noun"),
    // Single verb
    () => dict.random("verb"),
    // Single adjective
    () => dict.random("adjective"),
    // adjective + noun (2 words)
    () => {
      const adj = dict.random("adjective");
      const noun = dict.random("noun");
      return adj && noun ? `${adj} ${noun}` : undefined;
    },
    // determiner + noun (2 words)
    () => {
      const det = dict.random("determiner");
      const noun = dict.random("noun");
      return det && noun ? `${det} ${noun}` : undefined;
    },
    // noun + verb (2 words)
    () => {
      const noun = dict.random("noun");
      const verb = dict.random("verb");
      return noun && verb ? `${noun} ${verb}` : undefined;
    },
    // adjective + noun + verb (3 words)
    () => {
      const adj = dict.random("adjective");
      const noun = dict.random("noun");
      const verb = dict.random("verb");
      return adj && noun && verb ? `${adj} ${noun} ${verb}` : undefined;
    },
  ];

  // Try a random pattern, fall back to a simple noun
  const text = choice(patterns)();
  return text ?? dict.random("noun") ?? "idea";
}

/* ------------------------------------------------------------------ */
/*  Production rules                                                   */
/* ------------------------------------------------------------------ */

export interface Production {
  /** Human-readable name of the rule */
  name: string;
  /** Returns null if the rule cannot apply to this text */
  apply(text: string, dict: Dictionary): ProductionResult | null;
}

export interface ProductionResult {
  /** New text after applying the rule */
  text: string;
  /** Describes what changed for debugging */
  description: string;
}

/** Look up which POS a word belongs to. Returns first match. */
function wordPos(word: string, dict: Dictionary): string | undefined {
  const lower = word.toLowerCase();
  for (const [pos, words] of dict.byPos) {
    if (words.includes(lower)) return pos;
  }
  return undefined;
}

/* -- Individual production rules ------------------------------------ */

/** Prepend an adjective before a noun. "sky" → "blue sky" */
const prependAdjective: Production = {
  name: "prepend-adjective",
  apply(text, dict) {
    const words = getWords(text);
    const nouns = words.filter((w) => wordPos(w.word, dict) === "noun");
    if (!nouns.length) return null;
    const target = choice(nouns);
    // Don't prepend if not preceded by a space (or at start of text)
    if (target.start > 0 && text[target.start - 1] !== " ") return null;
    const adj = dict.random("adjective");
    if (!adj) return null;
    const newText = text.slice(0, target.start) + adj + " " + text.slice(target.start);
    return { text: newText, description: `prepend "${adj}" before "${target.word}"` };
  },
};

/** Append an adverb after a verb. "run" → "run quickly" */
const appendAdverb: Production = {
  name: "append-adverb",
  apply(text, dict) {
    const words = getWords(text);
    const verbs = words.filter((w) => wordPos(w.word, dict) === "verb");
    if (!verbs.length) return null;
    const target = choice(verbs);
    const adv = dict.random("adverb");
    if (!adv) return null;
    const newText = text.slice(0, target.end) + " " + adv + text.slice(target.end);
    return { text: newText, description: `append "${adv}" after "${target.word}"` };
  },
};

/** Add a determiner/article before a bare noun. "cat" → "the cat" */
const addDeterminer: Production = {
  name: "add-determiner",
  apply(text, dict) {
    const words = getWords(text);
    const nouns = words.filter((w) => wordPos(w.word, dict) === "noun");
    if (!nouns.length) return null;
    const target = choice(nouns);
    // Check if already preceded by a determiner/article
    if (target.start > 0) {
      const before = text.slice(0, target.start).trimEnd();
      const prevWord = before.split(/\s+/).pop() ?? "";
      const prevPos = wordPos(prevWord, dict);
      if (prevPos === "determiner" || prevPos === "indefinite article" || prevPos === "definite article") {
        return null;
      }
    }
    const det = chance(0.5) ? choice(["the", "a", "this", "that", "some", "every"]) : (dict.random("determiner") ?? "the");
    const newText = text.slice(0, target.start) + det + " " + text.slice(target.start);
    return { text: newText, description: `add "${det}" before "${target.word}"` };
  },
};

/** Add a prepositional phrase at the end. "the cat" → "the cat on a hill" */
const addPrepPhrase: Production = {
  name: "add-prep-phrase",
  apply(text, dict) {
    const prep = dict.random("preposition");
    const noun = dict.random("noun");
    if (!prep || !noun) return null;
    const det = chance(0.5) ? choice(["the", "a"]) + " " : "";
    const phrase = ` ${prep} ${det}${noun}`;
    const newText = text + phrase;
    return { text: newText, description: `add "${phrase.trim()}" at end` };
  },
};

/** Join with a conjunction. "the cat runs" → "the cat runs and the dog sleeps" */
const addConjunction: Production = {
  name: "add-conjunction",
  apply(text, dict) {
    if (text.length < 3) return null;
    const conj = choice(["and", "but", "or", "yet"]);
    // Generate a small clause to append
    const noun = dict.random("noun");
    const verb = dict.random("verb");
    if (!noun || !verb) return null;
    const clause = chance(0.5) ? `${noun} ${verb}` : noun;
    const newText = `${text} ${conj} ${clause}`;
    return { text: newText, description: `add "${conj} ${clause}"` };
  },
};

/** Replace a word with a same-POS synonym. "big cat" → "large cat" */
const replaceWithSamePos: Production = {
  name: "replace-same-pos",
  apply(text, dict) {
    const words = getWords(text);
    if (!words.length) return null;
    const target = choice(words);
    const pos = wordPos(target.word, dict);
    if (!pos) return null;
    const replacement = dict.random(pos);
    if (!replacement || replacement.toLowerCase() === target.word.toLowerCase()) return null;
    const newText = text.slice(0, target.start) + replacement + text.slice(target.end);
    return { text: newText, description: `replace "${target.word}" with "${replacement}"` };
  },
};

/** Add a pronoun subject. "runs" → "she runs" */
const addPronounSubject: Production = {
  name: "add-pronoun-subject",
  apply(text, dict) {
    const words = getWords(text);
    if (!words.length) return null;
    const first = words[0]!;
    const firstPos = wordPos(first.word, dict);
    if (firstPos !== "verb") return null;
    // Only add if the text starts with a verb (no subject)
    const pronoun = choice(["I", "you", "we", "they", "she", "he", "it"]);
    const newText = pronoun + " " + text;
    return { text: newText, description: `add subject "${pronoun}"` };
  },
};

/** Append a noun after a verb. "she runs" → "she runs marathons" */
const addObject: Production = {
  name: "add-object",
  apply(text, dict) {
    const words = getWords(text);
    const verbs = words.filter((w) => wordPos(w.word, dict) === "verb");
    if (!verbs.length) return null;
    // Pick the last verb
    const target = verbs[verbs.length - 1]!;
    // Check if already followed by a noun (don't double-add)
    const nextWord = words.find((w) => w.start > target.end);
    if (nextWord && wordPos(nextWord.word, dict) === "noun") return null;
    const noun = dict.random("noun");
    if (!noun) return null;
    const newText = text.slice(0, target.end) + " " + noun + text.slice(target.end);
    return { text: newText, description: `add object "${noun}" after "${target.word}"` };
  },
};

/** Add an exclamation at the end. "the sky" → "the sky wow" */
const addExclamation: Production = {
  name: "add-exclamation",
  apply(text, dict) {
    if (text.length < 2) return null;
    const exc = dict.random("exclamation");
    if (!exc) return null;
    const newText = text + " " + exc;
    return { text: newText, description: `add exclamation "${exc}"` };
  },
};

/** Add punctuation at the end. "the cat runs" → "the cat runs." */
const addPunctuation: Production = {
  name: "add-punctuation",
  apply(text) {
    if (!text.length) return null;
    const lastChar = text[text.length - 1]!;
    if (/[.!?;,…]/.test(lastChar)) return null;
    const punct = choice([".", "!", "?", "…"]);
    return { text: text + punct, description: `add "${punct}"` };
  },
};

/** Prepend an adverb before a verb. "run" → "quickly run" */
const prependAdverb: Production = {
  name: "prepend-adverb",
  apply(text, dict) {
    const words = getWords(text);
    const verbs = words.filter((w) => wordPos(w.word, dict) === "verb");
    if (!verbs.length) return null;
    const target = choice(verbs);
    const adv = dict.random("adverb");
    if (!adv) return null;
    const newText = text.slice(0, target.start) + adv + " " + text.slice(target.start);
    return { text: newText, description: `prepend "${adv}" before "${target.word}"` };
  },
};

/** Add a number before a noun. "cats" → "seven cats" */
const addNumber: Production = {
  name: "add-number",
  apply(text, dict) {
    const words = getWords(text);
    const nouns = words.filter((w) => wordPos(w.word, dict) === "noun");
    if (!nouns.length) return null;
    const target = choice(nouns);
    const num = dict.random("number");
    if (!num) return null;
    // Don't add if already preceded by a number
    if (target.start > 0) {
      const before = text.slice(0, target.start).trimEnd();
      const prevWord = before.split(/\s+/).pop() ?? "";
      if (wordPos(prevWord, dict) === "number") return null;
    }
    const newText = text.slice(0, target.start) + num + " " + text.slice(target.start);
    return { text: newText, description: `add "${num}" before "${target.word}"` };
  },
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** All available production rules */
export const productions: Production[] = [
  prependAdjective,
  appendAdverb,
  addDeterminer,
  addPrepPhrase,
  addConjunction,
  replaceWithSamePos,
  addPronounSubject,
  addObject,
  addExclamation,
  addPunctuation,
  prependAdverb,
  addNumber,
];

/**
 * Apply one random production rule to the text.
 * Tries up to `maxAttempts` different rules before giving up.
 * Returns null if no rule could be applied.
 */
export function applyProduction(text: string, dict: Dictionary, maxAttempts = 6): ProductionResult | null {
  const shuffled = [...productions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  for (let i = 0; i < Math.min(maxAttempts, shuffled.length); i++) {
    const rule = shuffled[i]!;
    const result = rule.apply(text, dict);
    if (result) return result;
  }
  return null;
}
