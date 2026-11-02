import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePageSortFileFactory } from "@pkcprotocol/pkc-js/page-sorts";
import { beforeEach, describe, expect, it } from "vitest";
import flairPageSort, {
  DEFAULT_SORT_NAME,
  FLAIRS_OPTION,
  LAYOUT_OPTION,
  ORDER_OPTION,
  SORT_NAME_OPTION,
  flairScore,
  flairTexts,
  resetSortData,
  splitFlairs,
  validatePageSortSettings
} from "../../src/index.js";
import type { SortDataEntry } from "../../src/index.js";
import { NOW, buildSettings, reply, scored } from "./fixtures.js";

const MODS = "Removed by mods";
const ADMINS = "Removed by admins";
const FLAIRS = `${MODS},${ADMINS}`;

// Each test gets its own file: the package caches one map per path
const dataFile = (data: Record<string, SortDataEntry>): string => {
  const file = join(mkdtempSync(join(tmpdir(), "flair-sort-data-")), "data.json");
  writeFileSync(file, JSON.stringify(data));
  return file;
};

const sortOf = (options: Record<string, string>) => flairPageSort({ pageSortSettings: buildSettings({ [FLAIRS_OPTION]: FLAIRS, ...options }) });
const score = (options: Record<string, string>, args: ReturnType<typeof scored>, replies = [] as ReturnType<typeof reply>[]) =>
  sortOf(options).score({ ...args, options: { [FLAIRS_OPTION]: FLAIRS, ...options }, replies });

beforeEach(resetSortData);

describe("the file", () => {
  it("passes pkc-js's own validation and publishes under the key it is given", () => {
    expect(() => validatePageSortFileFactory(flairPageSort, { name: "@pkcprotocol/flair-page-sort" })).not.toThrow();
    expect(sortOf({})).toMatchObject({ sortName: DEFAULT_SORT_NAME, flat: false, requireReplies: true });
    expect(sortOf({ [SORT_NAME_OPTION]: "hot" }).sortName).toBe("hot");
    expect(sortOf({ [SORT_NAME_OPTION]: " flaired-tree " }).sortName).toBe("flaired-tree");
  });

  it("is a flat page without the replies when told so, and still needs them to count for hot", () => {
    expect(sortOf({ [LAYOUT_OPTION]: "flat" })).toMatchObject({ flat: true, requireReplies: false });
    expect(sortOf({ [LAYOUT_OPTION]: "flat", [ORDER_OPTION]: "hot" })).toMatchObject({ flat: true, requireReplies: true });
    expect(sortOf({ [LAYOUT_OPTION]: "tree", [ORDER_OPTION]: "best" })).toMatchObject({ flat: false, requireReplies: true });
  });
});

describe("validation", () => {
  const validate = (options: Record<string, string>) => () => validatePageSortSettings({ pageSortSettings: buildSettings(options) });

  it("needs at least one flair, nothing else", () => {
    expect(validate({ [FLAIRS_OPTION]: MODS })).not.toThrow();
    expect(validate({})).toThrow(/flairs/);
    expect(validate({ [FLAIRS_OPTION]: " , " })).toThrow(/flairs/);
    expect(validate({ [FLAIRS_OPTION]: Array.from({ length: 65 }, (_, i) => `f${i}`).join(",") })).toThrow(/maximum is 64/);
    expect(validate({ [FLAIRS_OPTION]: "x".repeat(129) })).toThrow(/maximum is 128/);
  });

  it("rejects a key, order, layout or weight that can't work", () => {
    expect(validate({ [FLAIRS_OPTION]: MODS, [SORT_NAME_OPTION]: "" })).toThrow(/sortName/);
    expect(validate({ [FLAIRS_OPTION]: MODS, [SORT_NAME_OPTION]: "two words" })).toThrow(/sortName/);
    expect(validate({ [FLAIRS_OPTION]: MODS, [SORT_NAME_OPTION]: "__proto__" })).toThrow(/sortName/);
    expect(validate({ [FLAIRS_OPTION]: MODS, [SORT_NAME_OPTION]: "hot" })).not.toThrow();
    expect(validate({ [FLAIRS_OPTION]: MODS, [ORDER_OPTION]: "busiest" })).toThrow(/order/);
    expect(validate({ [FLAIRS_OPTION]: MODS, [LAYOUT_OPTION]: "nested" })).toThrow(/layout/);
    expect(validate({ [FLAIRS_OPTION]: MODS, nativeWeight: "x" })).toThrow(/nativeWeight/);
    expect(validate({ [FLAIRS_OPTION]: MODS, [ORDER_OPTION]: "best", [LAYOUT_OPTION]: "flat", nativeWeight: "2.5" })).not.toThrow();
  });
});

describe("the filter", () => {
  it("keeps a comment that carries one of the flairs, set by a moderator or by the author", () => {
    expect(score({}, scored("QmA", { flairs: [MODS] }))).not.toBeNull();
    expect(score({}, scored("QmB", { flairs: ["Something else"] }))).toBeNull();
    expect(score({}, scored("QmC"))).toBeNull();
    const authorFlaired = scored("QmD");
    authorFlaired.comment = { ...authorFlaired.comment, flairs: [{ text: ADMINS }] };
    expect(score({}, authorFlaired)).not.toBeNull();
    // A moderator's flairs replace the author's
    const overridden = { ...authorFlaired, commentUpdate: { ...authorFlaired.commentUpdate, flairs: [{ text: "Nope" }] } };
    expect(score({}, overridden)).toBeNull();
    expect(flairTexts(overridden)).toEqual(["Nope"]);
  });

  it("on a tree page keeps a comment with a flaired reply anywhere under it, so the chain above a flaired reply stays", () => {
    expect(score({}, scored("QmPost"), [reply("QmMid"), reply("QmGone", { flairs: [MODS] })])).not.toBeNull();
    expect(score({}, scored("QmPost"), [reply("QmMid"), reply("QmOther", { flairs: ["Something else"] })])).toBeNull();
    // Replies the community itself removed still count as flaired: a tombstone keeps its flair
    expect(score({}, scored("QmPost"), [reply("QmGone", { flairs: [MODS], commentUpdate: { removed: true } })])).not.toBeNull();
  });

  it("on a flat page keeps only the flaired comments themselves", () => {
    const flat = { [LAYOUT_OPTION]: "flat" };
    expect(score(flat, scored("QmPost"), [reply("QmGone", { flairs: [MODS] })])).toBeNull();
    expect(score(flat, scored("QmGone", { flairs: [MODS] }))).not.toBeNull();
  });

  it("matches the flairs the options name, exact and trimmed", () => {
    expect(splitFlairs(" a , b,,c ")).toEqual(["a", "b", "c"]);
    expect(score({ [FLAIRS_OPTION]: ADMINS }, scored("QmA", { flairs: [MODS] }))).toBeNull();
    expect(score({ [FLAIRS_OPTION]: ` ${ADMINS} ` }, scored("QmA", { flairs: [ADMINS] }))).not.toBeNull();
    expect(score({}, scored("QmA", { flairs: ["removed by mods"] }))).toBeNull();
  });
});

describe("orders", () => {
  const file = () =>
    dataFile({
      QmPost: { score: 10, createdUtc: NOW - 86400, flairedAt: null },
      QmGonePost: { score: 10, createdUtc: NOW - 3 * 86400, flairedAt: NOW - 2 * 86400 },
      QmGoneReply: { score: 3, createdUtc: NOW - 7200, flairedAt: NOW - 3600 },
      QmOlderGoneReply: { score: 3, createdUtc: NOW - 7200, flairedAt: NOW - 5 * 86400 },
      QmBest: { score: 50, createdUtc: NOW - 100 }
    });

  it("flaired: most recently flaired first, the reply's flairing counting for the thread, the comment's own time without data", () => {
    const options = { sortDataPath: file() };
    const s = (args: ReturnType<typeof scored>, replies?: ReturnType<typeof reply>[]) => score(options, args, replies);
    expect(s(scored("QmPost"), [reply("QmUp"), reply("QmGoneReply", { flairs: [MODS] })])).toBe(NOW - 3600);
    expect(s(scored("QmGonePost", { flairs: [MODS] }), [reply("QmOlderGoneReply", { flairs: [MODS] })])).toBe(NOW - 2 * 86400);
    expect(s(scored("QmNative", { timestamp: NOW - 10, flairs: [MODS] }))).toBe(NOW - 10);
    // The data file is optional: without one every comment ranks by its own time
    expect(score({}, scored("QmGonePost", { timestamp: NOW - 5, flairs: [MODS] }))).toBe(NOW - 5);
  });

  it("new: creation time from the data file, else the comment's own", () => {
    const options = { sortDataPath: file(), [ORDER_OPTION]: "new" };
    expect(score(options, scored("QmGonePost", { flairs: [MODS] }))).toBe(NOW - 3 * 86400);
    expect(score(options, scored("QmNative", { timestamp: NOW - 10, flairs: [MODS] }))).toBe(NOW - 10);
  });

  it("hot: replies present under it, most recently flaired first among equals, votes playing no part", () => {
    const options = { sortDataPath: file(), [ORDER_OPTION]: "hot" };
    const removed = reply("QmGoneReply", { flairs: [MODS] });
    const present = (n: number) => Array.from({ length: n }, (_, i) => reply(`QmUp${i}`));
    const absent = [
      reply("QmR", { commentUpdate: { removed: true } }),
      reply("QmD", { commentUpdate: { edit: { deleted: true } } }),
      reply("QmP", { commentUpdate: { pendingApproval: true } }),
      reply("QmN", { commentUpdate: { approved: false } })
    ];
    const s = (replies: ReturnType<typeof reply>[], args = scored("QmPost")) => score(options, args, replies) as number;
    expect(s([removed, ...present(9), ...absent])).toBeCloseTo(10 + (NOW - 3600) / 1e10, 6);
    const older = s(present(11), scored("QmGonePost", { flairs: [MODS] }));
    expect(older).toBeGreaterThan(s([removed, ...present(9)]));
    const olderTie = s(present(10), scored("QmGonePost", { flairs: [MODS] }));
    expect(olderTie).toBeLessThan(s([removed, ...present(9)]));
    expect(olderTie).toBeGreaterThan(9);
    expect(s([removed], scored("QmPost", { votes: 500 }))).toBe(s([removed]));
    expect(score(options, scored("QmPost"), present(500))).toBeNull();
    expect(s(present(3), scored("QmNative", { timestamp: NOW - 10, flairs: [MODS] }))).toBeCloseTo(3 + (NOW - 10) / 1e10, 6);
  });

  it("best: the data file's score plus weighted native votes, older first among equals", () => {
    const options = { sortDataPath: file(), [ORDER_OPTION]: "best" };
    expect(score(options, scored("QmBest", { flairs: [MODS], votes: 2 }))).toBeCloseTo(52 - (NOW - 100) / 1e10, 12);
    expect(score({ ...options, nativeWeight: "3" }, scored("QmBest", { flairs: [MODS], votes: 2 }))).toBeCloseTo(56 - (NOW - 100) / 1e10, 12);
    expect(score(options, scored("QmNative", { flairs: [MODS], votes: -1 }))).toBeCloseTo(-1 - NOW / 1e10, 12);
    const a = score(options, scored("QmGoneReply", { flairs: [MODS] })) as number;
    const b = score(options, scored("QmOlderGoneReply", { flairs: [MODS] })) as number;
    expect(a).toBe(b); // same score, same creation time
  });
});

describe("flairScore for clients", () => {
  it("re-sorts from the published options and a walked reply tree, without a data file", () => {
    const options = { [FLAIRS_OPTION]: MODS, [ORDER_OPTION]: "hot" };
    const post = scored("QmPost", { timestamp: NOW - 50 });
    expect(flairScore(new Map(), { ...post, options, replies: [reply("QmA"), reply("QmGone", { flairs: [MODS] })] })).toBeCloseTo(2 + (NOW - 50) / 1e10, 6);
    expect(flairScore(new Map(), { ...post, options, replies: [reply("QmA")] })).toBeNull();
  });
});
