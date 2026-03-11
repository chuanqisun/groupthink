import { describe, expect, it } from "vitest";

import { buildFromEntries } from "./dictionary";
import type { Dictionary } from "./dictionary";
import { applyProduction, createSeed, productions } from "./grammar";

/* ------------------------------------------------------------------ */
/*  Shared test dictionary                                             */
/* ------------------------------------------------------------------ */

function makeDict(): Dictionary {
  return buildFromEntries([
    { word: "cat", pos: "noun" },
    { word: "dog", pos: "noun" },
    { word: "sky", pos: "noun" },
    { word: "run", pos: "verb" },
    { word: "jump", pos: "verb" },
    { word: "sing", pos: "verb" },
    { word: "big", pos: "adjective" },
    { word: "small", pos: "adjective" },
    { word: "red", pos: "adjective" },
    { word: "quickly", pos: "adverb" },
    { word: "slowly", pos: "adverb" },
    { word: "the", pos: "definite article" },
    { word: "a", pos: "indefinite article" },
    { word: "every", pos: "determiner" },
    { word: "some", pos: "determiner" },
    { word: "and", pos: "conjunction" },
    { word: "on", pos: "preposition" },
    { word: "in", pos: "preposition" },
    { word: "wow", pos: "exclamation" },
    { word: "seven", pos: "number" },
  ]);
}

/* ------------------------------------------------------------------ */
/*  createSeed                                                         */
/* ------------------------------------------------------------------ */

describe("createSeed", () => {
  it("returns a non-empty string", () => {
    const dict = makeDict();
    for (let i = 0; i < 30; i++) {
      const seed = createSeed(dict);
      expect(seed.length).toBeGreaterThan(0);
    }
  });

  it("never exceeds 3 words", () => {
    const dict = makeDict();
    for (let i = 0; i < 100; i++) {
      const seed = createSeed(dict);
      const wordCount = seed.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(3);
    }
  });

  it("uses words from the dictionary", () => {
    const dict = makeDict();
    const allWords = new Set<string>();
    for (const words of dict.byPos.values()) {
      for (const w of words) allWords.add(w);
    }
    allWords.add("idea"); // fallback word
    for (let i = 0; i < 50; i++) {
      const seed = createSeed(dict);
      for (const w of seed.split(/\s+/)) {
        expect(allWords.has(w)).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Production rules                                                   */
/* ------------------------------------------------------------------ */

describe("productions", () => {
  it("has at least 10 production rules for diversity", () => {
    expect(productions.length).toBeGreaterThanOrEqual(10);
  });

  it("each production has a name", () => {
    for (const p of productions) {
      expect(p.name).toBeTruthy();
    }
  });
});

describe("prepend-adjective", () => {
  it("adds an adjective before a noun", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "prepend-adjective")!;
    const result = rule.apply("cat", dict);
    if (result) {
      // Should contain a word from adjectives + "cat"
      expect(result.text).toMatch(/\w+ cat/);
    }
  });
});

describe("append-adverb", () => {
  it("adds an adverb after a verb", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "append-adverb")!;
    const result = rule.apply("run", dict);
    if (result) {
      expect(result.text).toMatch(/run \w+/);
    }
  });
});

describe("add-determiner", () => {
  it("adds a determiner before a noun", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-determiner")!;
    const result = rule.apply("cat", dict);
    if (result) {
      expect(result.text).toMatch(/\w+ cat/);
    }
  });

  it("does not double-add determiners", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-determiner")!;
    const result = rule.apply("the cat", dict);
    // Should return null since "the" is already a determiner
    expect(result).toBeNull();
  });
});

describe("add-prep-phrase", () => {
  it("appends a prepositional phrase", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-prep-phrase")!;
    const result = rule.apply("the cat", dict);
    if (result) {
      expect(result.text.length).toBeGreaterThan("the cat".length);
      // Should contain a preposition
      expect(result.text).toMatch(/\b(on|in)\b/);
    }
  });
});

describe("add-conjunction", () => {
  it("adds a conjunction clause", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-conjunction")!;
    const result = rule.apply("the cat runs", dict);
    if (result) {
      expect(result.text).toMatch(/\b(and|but|or|yet)\b/);
    }
  });

  it("returns null for very short text", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-conjunction")!;
    expect(rule.apply("ab", dict)).toBeNull();
  });
});

describe("replace-same-pos", () => {
  it("replaces a word with another of the same POS", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "replace-same-pos")!;
    // Run multiple times since it's random
    let replaced = false;
    for (let i = 0; i < 30; i++) {
      const result = rule.apply("big cat", dict);
      if (result && result.text !== "big cat") {
        replaced = true;
        // The word count should stay the same
        expect(result.text.split(/\s+/).length).toBe(2);
        break;
      }
    }
    expect(replaced).toBe(true);
  });
});

describe("add-pronoun-subject", () => {
  it("adds a pronoun before a leading verb", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-pronoun-subject")!;
    const result = rule.apply("run", dict);
    if (result) {
      expect(result.text).toMatch(/^\w+ run$/);
    }
  });

  it("returns null when text does not start with a verb", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-pronoun-subject")!;
    const result = rule.apply("big cat", dict);
    expect(result).toBeNull();
  });
});

describe("add-object", () => {
  it("adds a noun after a verb", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-object")!;
    const result = rule.apply("run", dict);
    if (result) {
      expect(result.text.split(/\s+/).length).toBe(2);
    }
  });
});

describe("add-punctuation", () => {
  it("adds punctuation at the end", () => {
    const rule = productions.find((p) => p.name === "add-punctuation")!;
    const dict = makeDict();
    const result = rule.apply("the cat", dict);
    if (result) {
      expect(result.text).toMatch(/[.!?…]$/);
    }
  });

  it("does not add punctuation if already present", () => {
    const rule = productions.find((p) => p.name === "add-punctuation")!;
    const dict = makeDict();
    expect(rule.apply("hello.", dict)).toBeNull();
    expect(rule.apply("hello!", dict)).toBeNull();
    expect(rule.apply("hello?", dict)).toBeNull();
  });
});

describe("add-number", () => {
  it("adds a number before a noun", () => {
    const dict = makeDict();
    const rule = productions.find((p) => p.name === "add-number")!;
    const result = rule.apply("cat", dict);
    if (result) {
      expect(result.text).toContain("seven");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  applyProduction                                                    */
/* ------------------------------------------------------------------ */

describe("applyProduction", () => {
  it("returns a modified text when rules can apply", () => {
    const dict = makeDict();
    let applied = false;
    for (let i = 0; i < 20; i++) {
      const result = applyProduction("cat", dict);
      if (result) {
        expect(result.text).not.toBe("cat");
        expect(result.description.length).toBeGreaterThan(0);
        applied = true;
        break;
      }
    }
    expect(applied).toBe(true);
  });

  it("returns null when no rule can apply", () => {
    const dict = buildFromEntries([]);
    const result = applyProduction("", dict, 20);
    expect(result).toBeNull();
  });

  it("only makes one small change at a time", () => {
    const dict = makeDict();
    for (let i = 0; i < 30; i++) {
      const result = applyProduction("big cat", dict);
      if (result) {
        // Word count should change by at most 3 (e.g., conjunction adds clause)
        const origWords = "big cat".split(/\s+/).length;
        const newWords = result.text.split(/\s+/).length;
        expect(Math.abs(newWords - origWords)).toBeLessThanOrEqual(3);
      }
    }
  });
});
