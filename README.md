# @pkcprotocol/flair-page-sort

A flair filter for [pkc-js](https://github.com/pkcprotocol/pkc-js) communities: a page that holds **only** the posts or replies carrying a configured flair, or with one somewhere under them, as a configurable page sort ([pkc-js `docs/protocol/page-sorts.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/page-sorts.md)). The community decides the page, not the client, so every client sees the same filtered page under the same key.

It was built for a community that mirrors a subreddit and flairs what Reddit removes, so the board can open on the removals and a thread can show only its removed replies in place. Nothing in it is Reddit-specific: any community whose moderators flair things (a `Needs sources` queue, a `Resolved` archive, a `Featured` page) can serve those flairs as a page.

## What it does

One file, listed once per page the community wants. Each entry says what to match and how to order, and the entry's own `sortName` says what key to publish under:

- **Keep rule.** A comment is on the page when it carries one of the configured flairs. On a `tree` layout, which is what posts always get, it is also kept when any comment under it carries one: a post with one removed reply is on the removed-posts page, and on a nested reply page a removed reply shows in its place with the chain of replies above it, since a declined reply takes its subtree with it. A `flat` reply page keeps only the flaired replies themselves, one level, so a removed answer shows even when its parent is not.
- **Orders.** `flaired`: most recently flaired first (the default; needs the data file, else creation time). `new`: newest first. `hot`: most replies present under it first, the most recently flaired first among equals, votes playing no part, so a busy removed thread stays up until a busier one comes along. `best`: a score from the data file plus weighted native votes, older first among equals.
- **Keys.** The page publishes under `flaired` unless the `settings.pages` entry sets its own `sortName`, which is pkc-js's field, not an option of this package. A community that wants clients to open on the filter publishes it as `hot` (Seedit opens on `hot` and never asks for a custom name), and keeps the full order under another key.
- **Flairs.** A flair set by a moderator (`commentUpdate.flairs`) replaces the author's (`comment.flairs`), as pkc-js documents. A reply the community removed keeps its flair and still counts for the comments above it.

## Requirements

- pkc-js `>=0.0.143` (configurable page sorts, `settings.pages`, tombstone replies passed to `score`, and the `sortName` field on a `settings.pages` entry, pkc-js#483, which is what lets one file be listed under several keys).
- Node `>=22` on the machine running the community. The file is imported by the community process.

## Install and configure on your community

```bash
npm install @pkcprotocol/flair-page-sort
```

### With pkc-js (TypeScript), running your own node

Register the factory under `pageSorts` and name it in `settings.pages`. This example is the removed-posts board: the front page (`hot`) lists the threads with a removal, busiest first; `flaired` is the same set most recently removed first; inside a thread the preloaded reply page is the removed replies in place, and `flaired` is the flat list of them.

```ts
import PKC from "@pkcprotocol/pkc-js";
import flairPageSort from "@pkcprotocol/flair-page-sort";

const pkc = await PKC({ pageSorts: { "@pkcprotocol/flair-page-sort": flairPageSort } });
const community = await pkc.createCommunity({ address: "yourboard.bso" });
const flairs = "Removed by mods on Reddit,Removed by Reddit admins";
await community.edit({
    settings: {
        ...community.settings,
        pages: {
            posts: [
                { name: "@pkcprotocol/flair-page-sort", sortName: "hot", options: { flairs, order: "hot" }, preloaded: true },
                { name: "@pkcprotocol/flair-page-sort", options: { flairs, order: "flaired" } },
                { name: "new" }
            ],
            replies: [
                { name: "@pkcprotocol/flair-page-sort", sortName: "flaired-tree", options: { flairs, layout: "tree", order: "best" }, preloaded: true },
                { name: "@pkcprotocol/flair-page-sort", options: { flairs, layout: "flat", order: "best" } },
                { name: "best" }
            ]
        }
    }
});
```

`settings` is replaced wholesale on edit, so pass the existing settings along. An entry without a `sortName` publishes under `flaired`. Two entries resolving to the same key under one scope are rejected (`ERR_PAGE_SORT_DUPLICATE_SORT_NAME`), so when the file is listed more than once under a scope, all but one need their own `sortName`.

### By file path

A `path` entry loads a file from the filesystem of the process running the community (the RPC server, under RPC). Point it at this package's entry file; the same options apply:

```ts
{
    path: "/absolute/path/to/node_modules/@pkcprotocol/flair-page-sort/dist/index.js",
    sortName: "hot",
    options: { flairs: "Removed by mods on Reddit", order: "hot" },
    preloaded: true
}
```

The file imports its neighbours in `dist/` by relative path and nothing else, so copying the `dist/` directory to the community's machine is enough. A `path` entry publishes no `name` in `community.pageSorts`.

### With bitsocial-cli

Until `bitsocial page-sort install` ships, use the `path` form against the RPC server's filesystem:

```bash
bitsocial community edit yourboard.bso \
  '--settings.pages.posts[0].path' /absolute/path/to/node_modules/@pkcprotocol/flair-page-sort/dist/index.js \
  '--settings.pages.posts[0].options.flairs' 'Removed by mods on Reddit' \
  '--settings.pages.posts[0].sortName' hot \
  '--settings.pages.posts[0].options.order' hot \
  '--settings.pages.posts[0].preloaded' true
```

### Options

Page sort options are strings. They are **public by default**: everything in `options` is published in `community.pageSorts.<scope>.<key>.publicOptions` unless its name is listed in the entry's `privateOptions`.

| Option | Required | Published | Default | Description |
|---|---|---|---|---|
| `flairs` | **yes** | yes, keep it so | | Comma-separated flair texts, trimmed, matched exactly and case-sensitively. A comment needs one of them, on itself or (posts, tree pages) on a comment under it. An entry without one is rejected: it could never put anything on the page |
| `order` | no | yes | `flaired` | `flaired`, `new`, `hot` or `best`, see above |
| `layout` | no | yes | `tree` | Reply pages: `tree` (nested, a reply stays when it or any reply under it is flaired) or `flat` (one level, only the flaired replies). Posts are always kept by the tree rule |
| `sortDataPath` | no | **list it in `privateOptions`** | none | Path of the optional data file on the community's machine, see below |
| `nativeWeight` | no | yes | `1` | `best` only: how much one native vote counts against one unit of the data file's score. A number |
| `maxAge`, `pinnedFirst`, `exclude*` | no | always (reserved) | pkc-js's per-scope defaults | pkc-js reserved options, applied by pkc-js to the comments the sort ranks before `score` runs. They cannot be made private |

`sortName` is not an option: it goes on the entry, next to `name`. pkc-js rejects an `options.sortName` as an undeclared option (`ERR_PAGE_SORT_OPTION_NOT_DECLARED_IN_OPTION_INPUTS`).

Keep `flairs` public: a UI reads it off `publicOptions` to tell what the page is about and to mark the matching comments, and most UIs never install this package.

### The data file

Optional. Without it the filter works as described and the orders use what the entry carries: the comment's own timestamp for `flaired` and `new`, native votes alone for `best`. With it, the community's owner can rank by things pkc-js does not know, such as when a flair was set or a score from elsewhere:

```json
{
    "QmcidOfOneComment": { "score": 42, "createdUtc": 1793296000, "flairedAt": 1793299600 },
    "QmcidOfAnother": { "score": null, "createdUtc": 1793200000, "flairedAt": null }
}
```

Keyed by the comment's CID. Every field is optional: `score` (a number for `best`), `createdUtc` (unix seconds, used by `new` and as the tie-break), `flairedAt` (unix seconds, when the flair was set, for `flaired` and the `hot` tie-break). The file is read when the entry is loaded and re-read in the background every 60 seconds, never inside `score`; write it atomically (temp file and rename). A missing or broken file leaves the last good content.

### Validation

The entry is validated when the community is created, on every edit (rejecting the whole write) and on start. This package rejects:

- No `flairs`, or a list holding no text (`""`, `" , "`). More than 64 flairs, or one over 128 characters.
- An `order` or `layout` outside the lists above, and a `nativeWeight` that is not a number.

The entry's `sortName` is validated by pkc-js, not here.

Failures surface as `ERR_PAGE_SORT_SETTINGS_VALIDATION_FAILED` inside pkc-js's aggregated `ERR_PAGE_SORT_SETTINGS_VALIDATION_FAILED_FOR_PAGE_SORTS`.

### What is published

```ts
community.pageSorts = {
    posts: {
        hot: {
            name: "@pkcprotocol/flair-page-sort", // absent for a path entry
            description: "Only the comments that carry one of the configured flairs, or (posts, and replies on a tree page) have one under them; ...",
            publicOptions: {
                flairs: "Removed by mods on Reddit,Removed by Reddit admins",
                order: "hot",
                layout: "tree",
                nativeWeight: "1",
                pinnedFirst: "true",
                excludeRemovedComments: "true",
                excludeDeletedComments: "true",
                excludeCommentPendingApproval: "true",
                excludeCommentWithApprovedFalse: "true",
                excludeCommentsWithDifferentCommunityAddress: "true"
            }
        }
    }
};
```

## For UI developers

- **Know what a page is.** `community.pageSorts.<scope>.<key>.publicOptions.flairs` says which flairs the page is about. A page whose `name` is this package (or whose options carry `flairs`) is a filter: show it as such, not as a full feed.
- **Mark the matching comments.** `hasFlair(entry, new Set(splitFlairs(publicOptions.flairs)))` is the package's own test, with a moderator's flairs overriding the author's. `flairTexts(entry)` lists what a comment carries.
- **Re-sort a page locally** (optional). `flairScore(data, { comment, commentUpdate, options, replies })` is the scorer on its own: pass the published `publicOptions` as `options`, an empty `Map` as `data` (the file is private to the community), and for `tree` or `hot` the comment's descendants walked from the reply pages, tombstones included, as pkc-js describes under "Client side". Without the data file the `flaired` order degrades to creation time and `best` to native votes; the filter itself reproduces exactly.

## Exports

| Export | What |
|---|---|
| `default`, `flairPageSort` | The factory: `sortName`, `scope` (either), `flat`, `requireReplies`, `optionInputs`, `score`, `validatePageSortSettings` |
| `flairScore(data, input)` | The scorer alone, for re-sorting on a client |
| `hasFlair`, `flairTexts`, `splitFlairs`, `isPresent` | The matching and the "reply present on the community" test the `hot` order uses |
| `FLAIRS_OPTION`, `ORDER_OPTION`, `LAYOUT_OPTION`, `SORT_DATA_PATH_OPTION`, `NATIVE_WEIGHT_OPTION` | The option names |
| `ORDERS`, `LAYOUTS`, `DEFAULT_SORT_NAME`, `DEFAULT_ORDER`, `DEFAULT_LAYOUT` | The lists and defaults |
| `sortData(path)`, `resetSortData()` | The data file cache (tests) |
| types | `SortDataEntry`, `FlairCommentLike`, and pkc-js's page sort types re-exported |

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

Tests are unit tests of the factory and the scorer against pkc-js's own types (`test/unit/fixtures.ts`), with the data file written to a temp directory. Commits follow conventional commits (commitlint runs on `commit-msg`); a push to `master` that passes CI is released and published by `release.yml`.

## License

GPL-3.0-or-later.
