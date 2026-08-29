export const BLOG_POST_CREATED: "BLOG_POST_CREATED";
export const BATCH_COUNTER_UPDATES: "BATCH_COUNTER_UPDATES";
export const GUESTBOOK_ENTRY_CREATED: "GUESTBOOK_ENTRY_CREATED";

export type BlogPostPayload = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
};

export type CounterKind = "like" | "retweet" | "reply";

export type CounterUpdatePayload = {
  targetId: string;
  type: CounterKind;
  newCount: number;
};

export type BatchCounterUpdate = {
  targetId: string;
  likesDelta: number;
  retweetsDelta: number;
  repliesDelta: number;
};

export type BatchCounterUpdatesPayload = BatchCounterUpdate[];

export type GuestbookEntryPayload = {
  entryId: string;
  postId: string;
  authorName: string;
  authorUsername: string;
  message: string;
  createdAt: string;
};

export function isBlogPostPayload(value: unknown): value is BlogPostPayload;
export function isCounterUpdatePayload(
  value: unknown,
): value is CounterUpdatePayload;
export function isBatchCounterUpdateItem(
  value: unknown,
): value is BatchCounterUpdate;
export function isBatchCounterUpdatesPayload(
  value: unknown,
): value is BatchCounterUpdatesPayload;
export function isGuestbookEntryPayload(
  value: unknown,
): value is GuestbookEntryPayload;
export function halloweenArtForPostId(postId: string): string;
export function initialsFromName(name: string): string;
export function formatPostDate(iso: string): string;
export function createLivePostCard(
  payload: BlogPostPayload,
  signedIn: boolean,
): unknown;
export function insertBlogPost(feed: unknown, payload: unknown): boolean;
export function applyCounterUpdate(
  payload: unknown,
  root?: {
    querySelectorAll: (selector: string) => Iterable<unknown>;
    querySelector?: (selector: string) => unknown;
  },
): boolean;
export function applyBatchCounterUpdates(
  payload: unknown,
  root?: {
    querySelectorAll: (selector: string) => Iterable<unknown>;
    querySelector?: (selector: string) => unknown;
  },
): boolean;
export function noteLocalCounterDelta(
  targetId: string,
  type: CounterKind,
  delta: number,
): void;
export function resetLocalCounterDeltas(): void;
export function applyGuestbookEntry(
  guestbook: unknown,
  payload: unknown,
  root?: {
    querySelectorAll: (selector: string) => Iterable<unknown>;
    querySelector?: (selector: string) => unknown;
  },
): boolean;
export function insertGuestbookEntry(
  guestbook: unknown,
  payload: unknown,
): boolean;
export function initSocketFeed(): unknown;
