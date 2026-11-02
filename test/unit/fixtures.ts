import type { PageSortReplyEntry, PageSortScoreArgs, PageSortSettingsEntry } from "../../src/types.js";

// Fixtures typed against pkc-js's own page-entry types, so tsc rejects a field that does not exist on the wire.

export type WireComment = PageSortScoreArgs["comment"];
export type WireCommentUpdate = PageSortScoreArgs["commentUpdate"];

export const COMMUNITY_PUBLIC_KEY = "communityPublicKeyBase64";
export const POST_CID = "QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR";
export const NOW = 1_793_296_000;

const signature = (signedPropertyNames: string[]) => ({
  type: "ed25519",
  signature: "signature",
  publicKey: "authorPublicKey",
  signedPropertyNames
});

const flairsOf = (texts: string[] | undefined) => (texts === undefined ? {} : { flairs: texts.map((text) => ({ text })) });

export const buildComment = (overrides: Partial<WireComment> & { timestamp: number }): WireComment => {
  const unsigned = {
    communityPublicKey: COMMUNITY_PUBLIC_KEY,
    protocolVersion: "1.0.0",
    depth: 0,
    content: "post content",
    title: "post title",
    author: { address: "author.bso", publicKey: "authorPublicKey" },
    ...overrides
  };
  return { ...unsigned, signature: signature(Object.keys(unsigned)) } as WireComment;
};

export const buildCommentUpdate = (overrides: Partial<WireCommentUpdate> & { cid: string }): WireCommentUpdate => {
  const unsigned = {
    upvoteCount: 0,
    downvoteCount: 0,
    replyCount: 0,
    updatedAt: NOW,
    protocolVersion: "1.0.0",
    ...overrides
  };
  return { ...unsigned, signature: signature(Object.keys(unsigned)) } as WireCommentUpdate;
};

/** What `score` receives for the comment being scored: a post or reply with the given flairs set by a moderator. */
export const scored = (cid: string, { timestamp = NOW, votes = 0, flairs }: { timestamp?: number; votes?: number; flairs?: string[] } = {}) => ({
  comment: buildComment({ timestamp }),
  commentUpdate: buildCommentUpdate({ cid, upvoteCount: Math.max(votes, 0), downvoteCount: Math.max(-votes, 0), ...flairsOf(flairs) }),
  baseTimestamp: NOW
});

/** A reply as pkc-js hands it to `score` under `requireReplies`: the lean PageSortReplyEntry. */
export const reply = (
  cid: string,
  {
    flairs,
    timestamp = NOW,
    commentUpdate = {}
  }: { flairs?: string[]; timestamp?: number; commentUpdate?: Partial<PageSortReplyEntry["commentUpdate"]> } = {}
): PageSortReplyEntry => ({
  comment: {
    parentCid: POST_CID,
    postCid: POST_CID,
    depth: 1,
    timestamp,
    content: "reply",
    author: { address: "replier.bso", publicKey: "replierPublicKey" },
    communityPublicKey: COMMUNITY_PUBLIC_KEY
  },
  commentUpdate: { cid, upvoteCount: 0, downvoteCount: 0, replyCount: 0, updatedAt: timestamp + 1, ...flairsOf(flairs), ...commentUpdate }
});

export const buildSettings = (options: Record<string, string>, extra: Partial<PageSortSettingsEntry> = {}): PageSortSettingsEntry => ({
  name: "@pkcprotocol/flair-page-sort",
  options,
  ...extra
});
