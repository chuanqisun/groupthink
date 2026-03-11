/**
 * Async dictionary loader that indexes Oxford 5000 words by part of speech.
 * Designed to be loaded once during app startup alongside sound files.
 */

export interface DictEntry {
  word: string;
  pos: string;
}

export interface Dictionary {
  /** All entries grouped by part of speech */
  byPos: Map<string, string[]>;
  /** Pick a random word for the given POS, or undefined if POS is missing */
  random(pos: string): string | undefined;
}

let cached: Dictionary | null = null;

function buildDictionary(entries: DictEntry[]): Dictionary {
  const byPos = new Map<string, string[]>();
  for (const { word, pos } of entries) {
    let list = byPos.get(pos);
    if (!list) {
      list = [];
      byPos.set(pos, list);
    }
    list.push(word);
  }
  return {
    byPos,
    random(pos: string): string | undefined {
      const list = byPos.get(pos);
      if (!list || list.length === 0) return undefined;
      return list[Math.floor(Math.random() * list.length)];
    },
  };
}

/** Load the Oxford-5000 dictionary asynchronously (cached after first load). */
export async function loadDictionary(): Promise<Dictionary> {
  if (cached) return cached;
  const mod = await import("./dictionary/oxford-5000.json");
  const entries: DictEntry[] = mod.default as DictEntry[];
  cached = buildDictionary(entries);
  return cached;
}

/** Build a dictionary from raw entries (for testing without async import). */
export function buildFromEntries(entries: DictEntry[]): Dictionary {
  return buildDictionary(entries);
}

/** Reset the cached dictionary (for testing). */
export function resetCache(): void {
  cached = null;
}
