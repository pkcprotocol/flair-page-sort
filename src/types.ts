// Re-exports of the pkc-js page sort types, so the package compiles against the contract the community
// actually runs (docs/protocol/page-sorts.md in pkc-js). Named root exports of pkc-js since 0.0.110.
import type {
  CommunityPageSortSetting,
  PageSortFile,
  PageSortFileFactory,
  PageSortFileFactoryArgs,
  PageSortReplyEntry,
  PageSortScoreArgs
} from "@pkcprotocol/pkc-js";

export type { CommunityPageSortSetting, PageSortFile, PageSortFileFactory, PageSortFileFactoryArgs, PageSortReplyEntry, PageSortScoreArgs };

/** One `settings.pages.<scope>[i]` entry as pkc-js hands it to the factory. */
export type PageSortSettingsEntry = CommunityPageSortSetting;

/** The subset of a comment this package reads: a page entry's `raw` and a `PageSortReplyEntry` are both supersets. */
export interface FlairCommentLike {
  comment: { timestamp: number; flairs?: readonly { text: string }[] | undefined };
  commentUpdate: {
    cid: string;
    flairs?: readonly { text: string }[] | undefined;
    upvoteCount?: number | undefined;
    downvoteCount?: number | undefined;
    removed?: boolean | undefined;
    approved?: boolean | undefined;
    pendingApproval?: boolean | undefined;
    edit?: { deleted?: boolean | undefined } | undefined;
  };
}

/**
 * What the optional data file knows about one comment, keyed by its CID: a score to rank by (`best`), when it was
 * created (`new`, tie-breaks), and when it was flaired (`flaired`). Every field is optional; a comment the file
 * doesn't know falls back to its own timestamp and votes.
 */
export interface SortDataEntry {
  score?: number | null | undefined;
  createdUtc?: number | null | undefined;
  flairedAt?: number | null | undefined;
}
