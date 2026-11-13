import { NATIVE_WEIGHT_OPTION, SORT_DATA_PATH_OPTION, nativeVotes, nativeWeightOf, sortData, type SortDataMap } from "./sort-data.js";
import type { FlairCommentLike, PageSortFile, PageSortFileFactory, PageSortFileFactoryArgs, PageSortSettingsEntry } from "./types.js";

/** Comma-separated flair texts; a comment needs one of them (or, on a tree page, one under it) to be on the page. Required. */
export const FLAIRS_OPTION = "flairs";
/** `flaired` (most recently flaired first), `new`, `hot` (most replies present first) or `best` (score plus votes). */
export const ORDER_OPTION = "order";
/** Reply pages: `tree` keeps a reply when it or any reply under it is flaired; `flat` lists only the flaired replies, one level. */
export const LAYOUT_OPTION = "layout";

/** The key the page publishes under unless the `settings.pages` entry sets its own `sortName`. */
export const DEFAULT_SORT_NAME = "flaired";
export const ORDERS = ["flaired", "new", "hot", "best"] as const;
export const LAYOUTS = ["tree", "flat"] as const;
export type Order = (typeof ORDERS)[number];
export type Layout = (typeof LAYOUTS)[number];
export const DEFAULT_ORDER: Order = "flaired";
export const DEFAULT_LAYOUT: Layout = "tree";

export const MAX_FLAIRS = 64;
export const MAX_FLAIR_LENGTH = 128;

export const DESCRIPTION =
  "Only the comments that carry one of the configured flairs, or (posts, and replies on a tree page) have one under them; most recently flaired first, newest first, most replies first, or best first";

export const optionInputs: NonNullable<PageSortFile["optionInputs"]> = [
  {
    option: FLAIRS_OPTION,
    label: "Flairs",
    description: "Comma-separated flair texts. A comment needs one of them, on itself or (posts, tree pages) on a comment under it, to be on the page. Exact, trimmed.",
    placeholder: "Removed by mods"
  },
  {
    option: ORDER_OPTION,
    label: "Order",
    description: `"flaired": most recently flaired first (needs the data file, else creation time); "new": newest first; "hot": most replies present first; "best": score plus votes, older first among equals`,
    placeholder: DEFAULT_ORDER
  },
  {
    option: LAYOUT_OPTION,
    label: "Layout (reply pages)",
    description: `"tree": a reply stays when it or any reply under it is flaired, so a flaired reply shows in place with the replies above it; "flat": one level, only the flaired replies`,
    placeholder: DEFAULT_LAYOUT
  },
  {
    option: SORT_DATA_PATH_OPTION,
    label: "Data file",
    description: 'Optional, keep it private: a JSON file { "<cid>": { "score", "createdUtc", "flairedAt" } } the community owner maintains, for the flaired and best orders'
  },
  {
    option: NATIVE_WEIGHT_OPTION,
    label: "Native vote weight",
    description: "How much one vote on the community counts against one unit of the data file's score (a number, default 1)",
    placeholder: "1"
  }
];

/** The flair texts an option value lists: comma-separated, trimmed, empty ones dropped. */
export const splitFlairs = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((text) => text.trim())
    .filter(Boolean);

const flairsOf = (options: Record<string, string> | undefined): ReadonlySet<string> => new Set(splitFlairs(options?.[FLAIRS_OPTION]));
const orderOf = (options: Record<string, string> | undefined): Order => {
  const order = options?.[ORDER_OPTION];
  return (ORDERS as readonly string[]).includes(order ?? "") ? (order as Order) : DEFAULT_ORDER;
};
const layoutOf = (options: Record<string, string> | undefined): Layout => {
  const layout = options?.[LAYOUT_OPTION];
  return (LAYOUTS as readonly string[]).includes(layout ?? "") ? (layout as Layout) : DEFAULT_LAYOUT;
};

/** The flair texts on a comment: a moderator's flairs (CommentUpdate) override the author's (Comment), as pkc-js documents. */
export const flairTexts = ({ comment, commentUpdate }: FlairCommentLike): string[] =>
  (commentUpdate.flairs ?? comment.flairs ?? []).map((flair) => flair.text.trim()).filter(Boolean);

export const hasFlair = (entry: FlairCommentLike, wanted: ReadonlySet<string>): boolean => flairTexts(entry).some((text) => wanted.has(text));

/** A reply that is on the community: not removed by its moderators, not deleted by its author, not awaiting or denied approval. */
export const isPresent = ({ commentUpdate }: FlairCommentLike): boolean =>
  commentUpdate.removed !== true && commentUpdate.edit?.deleted !== true && commentUpdate.pendingApproval !== true && commentUpdate.approved !== false;

const sameOrdinal = (a: readonly string[], b: string): boolean => a.includes(b);

/** Sync, runs on every community start and every settings edit. Rejects an entry that can never produce a page. */
export const validatePageSortSettings = ({ pageSortSettings }: { pageSortSettings: PageSortSettingsEntry }): void => {
  const options = pageSortSettings.options ?? {};
  const flairs = splitFlairs(options[FLAIRS_OPTION]);
  if (flairs.length === 0) throw new Error(`${FLAIRS_OPTION} must list at least one flair text; nothing could ever be on the page`);
  if (flairs.length > MAX_FLAIRS) throw new Error(`${FLAIRS_OPTION} lists ${flairs.length} flairs, the maximum is ${MAX_FLAIRS}`);
  for (const flair of flairs)
    if (flair.length > MAX_FLAIR_LENGTH) throw new Error(`${FLAIRS_OPTION} flair "${flair.slice(0, 16)}..." is ${flair.length} chars, the maximum is ${MAX_FLAIR_LENGTH}`);
  const order = options[ORDER_OPTION];
  if (order !== undefined && !sameOrdinal(ORDERS, order)) throw new Error(`${ORDER_OPTION} must be one of ${ORDERS.join(", ")}, got "${order.slice(0, 32)}"`);
  const layout = options[LAYOUT_OPTION];
  if (layout !== undefined && !sameOrdinal(LAYOUTS, layout)) throw new Error(`${LAYOUT_OPTION} must be one of ${LAYOUTS.join(", ")}, got "${layout.slice(0, 32)}"`);
  const weight = options[NATIVE_WEIGHT_OPTION];
  if (weight !== undefined && !Number.isFinite(Number(weight))) throw new Error(`${NATIVE_WEIGHT_OPTION} must be a number, got "${weight.slice(0, 32)}"`);
};

export interface ScoreInput {
  comment: FlairCommentLike["comment"];
  commentUpdate: FlairCommentLike["commentUpdate"];
  options?: Record<string, string> | undefined;
  replies?: readonly FlairCommentLike[] | undefined;
}

/**
 * The scorer, on its own so a client holding the published `publicOptions` and a walked reply tree can re-sort a page.
 * `null` declines the comment. `data` is the map of the data file (empty when there is none).
 */
export function flairScore(data: SortDataMap, { comment, commentUpdate, options, replies }: ScoreInput): number | null {
  const wanted = flairsOf(options);
  const own = hasFlair({ comment, commentUpdate }, wanted);
  const descendants = replies ?? [];
  const flairedBelow = layoutOf(options) === "flat" ? [] : descendants.filter((reply) => hasFlair(reply, wanted));
  if (!own && flairedBelow.length === 0) return null;
  const entry = data.get(commentUpdate.cid);
  const created = entry?.createdUtc ?? comment.timestamp;
  const order = orderOf(options);
  if (order === "new") return created;
  if (order === "best") return (entry?.score ?? 0) + nativeWeightOf(options) * nativeVotes(commentUpdate) - created / 1e10;
  // When the thread was last flaired: the comment's own flairing, or the latest among the flaired replies under it
  let flairedAt: number | null = own ? (entry?.flairedAt ?? null) : null;
  for (const reply of flairedBelow) {
    const at = data.get(reply.commentUpdate.cid)?.flairedAt;
    if (at) flairedAt = Math.max(flairedAt ?? 0, at);
  }
  if (order === "flaired") return flairedAt ?? created;
  // hot: replies present under it, the tie-break folded in as a fraction smaller than one reply
  return descendants.filter(isPresent).length + (flairedAt ?? created) / 1e10;
}

/**
 * The page sort file factory. pkc-js calls it once per community start and per settings edit with the entry, and
 * caches the result. List it under `posts` or `replies`, once per page wanted; an entry listed next to another sets
 * its own `sortName`, which pkc-js resolves ahead of the default returned here.
 */
export const flairPageSort: PageSortFileFactory = ({ pageSortSettings }: PageSortFileFactoryArgs): PageSortFile => {
  const options = pageSortSettings.options;
  const data = sortData(options?.[SORT_DATA_PATH_OPTION]);
  const layout = layoutOf(options);
  const order = orderOf(options);
  return {
    sortName: DEFAULT_SORT_NAME,
    description: DESCRIPTION,
    // A flat page keeps only the flaired comments themselves and needs the replies only to count them
    flat: layout === "flat",
    requireReplies: layout === "tree" || order === "hot",
    optionInputs,
    defaultOptions: { [ORDER_OPTION]: DEFAULT_ORDER, [LAYOUT_OPTION]: DEFAULT_LAYOUT, [NATIVE_WEIGHT_OPTION]: "1" },
    score: ({ comment, commentUpdate, options, replies }) => flairScore(data.map, { comment, commentUpdate, options, replies }),
    validatePageSortSettings
  };
};

export default flairPageSort;
