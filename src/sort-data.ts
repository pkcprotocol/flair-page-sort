import { readFileSync, promises as fs } from "node:fs";
import type { SortDataEntry } from "./types.js";

/** The private option naming the JSON data file: `{ "<cid>": { score, createdUtc, flairedAt } }`. */
export const SORT_DATA_PATH_OPTION = "sortDataPath";
/** How much one native vote counts against one unit of the file's `score`, a number, default 1. */
export const NATIVE_WEIGHT_OPTION = "nativeWeight";

export const REFRESH_MS = 60_000;

export type SortDataMap = ReadonlyMap<string, SortDataEntry>;

interface Cache {
  map: SortDataMap;
}

const caches = new Map<string, Cache>();

const parse = (text: string): SortDataMap => {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) return new Map();
  return new Map(Object.entries(data as Record<string, SortDataEntry>));
};

/**
 * The map for one file, shared by every entry that reads it. `score` is sync and gets no database, so the file is
 * read once when the factory runs and refreshed in the background every `REFRESH_MS`; a missing or broken file
 * leaves the last good map (empty to begin with). No path means no data: the filter still works, the orders fall
 * back to timestamps and votes.
 */
export function sortData(path: string | undefined): Cache {
  if (!path) return { map: new Map() };
  let cache = caches.get(path);
  if (!cache) {
    const fresh: Cache = { map: new Map() };
    try {
      fresh.map = parse(readFileSync(path, "utf8"));
    } catch {
      // first read failed: stays empty until the file appears
    }
    const timer = setInterval(() => {
      fs.readFile(path, "utf8")
        .then((text) => void (fresh.map = parse(text)))
        .catch(() => {});
    }, REFRESH_MS);
    timer.unref();
    cache = fresh;
    caches.set(path, cache);
  }
  return cache;
}

/** For tests: forget every cached file, so a path can be re-read from scratch. */
export const resetSortData = (): void => caches.clear();

export const nativeWeightOf = (options: Record<string, string> | undefined): number => {
  const weight = Number(options?.[NATIVE_WEIGHT_OPTION] ?? "1");
  return Number.isFinite(weight) ? weight : 1;
};

export const nativeVotes = (commentUpdate: { upvoteCount?: number | undefined; downvoteCount?: number | undefined }): number =>
  (commentUpdate.upvoteCount ?? 0) - (commentUpdate.downvoteCount ?? 0);
