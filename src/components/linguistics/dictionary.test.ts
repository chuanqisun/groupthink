import { describe, expect, it } from "vitest";

import { buildFromEntries } from "./dictionary";

describe("dictionary", () => {
  const entries = [
    { word: "cat", pos: "noun" },
    { word: "dog", pos: "noun" },
    { word: "run", pos: "verb" },
    { word: "big", pos: "adjective" },
    { word: "quickly", pos: "adverb" },
    { word: "the", pos: "definite article" },
  ];

  it("groups words by part of speech", () => {
    const dict = buildFromEntries(entries);
    expect(dict.byPos.get("noun")).toEqual(["cat", "dog"]);
    expect(dict.byPos.get("verb")).toEqual(["run"]);
    expect(dict.byPos.get("adjective")).toEqual(["big"]);
    expect(dict.byPos.get("adverb")).toEqual(["quickly"]);
  });

  it("returns a word for a valid POS", () => {
    const dict = buildFromEntries(entries);
    const word = dict.random("noun");
    expect(["cat", "dog"]).toContain(word);
  });

  it("returns undefined for an unknown POS", () => {
    const dict = buildFromEntries(entries);
    expect(dict.random("pronoun")).toBeUndefined();
  });

  it("handles empty entries", () => {
    const dict = buildFromEntries([]);
    expect(dict.byPos.size).toBe(0);
    expect(dict.random("noun")).toBeUndefined();
  });
});
