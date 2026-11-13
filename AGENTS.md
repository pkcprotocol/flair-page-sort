# AGENTS Notes

Reference source files for this repository, all in the pkc-js repository:

`docs/protocol/page-sorts.md` (the contract this package implements: `null` declines, `requireReplies`, `flat`, the client-side re-sort)
`src/community/schema.ts` (`PageSortFileSchema`, `CommunityPageSortSettingSchema`)
`src/pages/types.ts` (`PageSortReplyEntry`)
`test/fixtures/page-sorts/most-replies.js` (a reply sort scoring over its own subtree, the shape of the tree layout)

Workflow:

- Before every commit, run `npm run typecheck`, `npm run build` and `npm test`, and see them pass. CI runs the same.
- Temporary files go under `.tmp/` in the repository, never `/tmp`.
- Never push to `master`. Every change goes on a branch and through a pull request, so it can be reviewed before it
  merges. A merge to `master` is a release (see Releasing), which is one more reason nothing lands there unreviewed.

Conventions specific to this package:

- `README.md` is the spec. Behaviour changes belong there first.
- One file, listed once per page: the file returns the constant key `flaired`, and the `settings.pages` entry sets
  its own `sortName` (pkc-js's field, resolved ahead of the file's; never an option of this package), so a community
  can publish the filter under several keys (`hot` to make clients open on it) with different `order` and `layout`.
  pkc-js rejects two entries resolving to the same key.
- The option names (`flairs`, `order`, `layout`, `sortDataPath`, `nativeWeight`) are the wire contract:
  UIs read `flairs` off `community.pageSorts.<scope>.<key>.publicOptions` to mark the comments the page is about,
  and most never install this package. A rename is a new contract, never an edit.
- `flairs` is required. An entry without one could never put anything on the page, so it is rejected rather than
  published empty.
- The keep rule is one predicate for both scopes: a comment stays when it carries one of the flairs, or (on a tree
  layout, which is what posts always get) when any comment under it does. On a nested reply page a declined reply
  takes its subtree with it, which is what cuts the thread down to the flaired replies and the chains above them.
  A flat reply page keeps only the flaired replies themselves.
- A flair set by a moderator (`commentUpdate.flairs`) replaces the author's (`comment.flairs`), as pkc-js documents.
  A tombstone (a reply the community removed) keeps its flair and still counts for the comments above it.
- `score` is sync and reads only what the entry carries plus the in-memory map of the optional data file. The file
  is read when the factory runs and refreshed in the background every 60 s, never inside `score`. No database, no
  network.
- The `hot` order counts replies present on the community (not removed, not author-deleted, not pending or denied
  approval), the tombstone rule of pkc-js's "Which replies count". The tie-break (most recently flaired first) is
  folded into the score as a fraction smaller than one reply; `best` folds "older first" in the same way.
- Test fixtures are typed against pkc-js's own types through `test/unit/fixtures.ts`. Do not cast a fixture through
  `unknown`; a field that does not exist on the wire must fail to compile. Never use the `any` type.

Releasing:

- Releases are automatic. A merge to `master` runs CI, and on success `release.yml` runs release-it, which bumps the
  version from the conventional-commit types, tags it, cuts a GitHub release, and publishes to npm with provenance.
- Publishing authenticates with npm trusted publishing (OIDC), not a token. `release.yml` needs `id-token: write` and
  pins the npm CLI to `npm@11`.
- A trusted publisher is configured under npm's package settings, so the package has to exist first. The first
  version is published by hand and has no provenance attestation. Every version after it is signed by CI. Never
  publish by hand once the trusted publisher is configured.
