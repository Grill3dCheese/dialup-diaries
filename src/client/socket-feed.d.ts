export const BLOG_POST_CREATED: "BLOG_POST_CREATED";

export type BlogPostPayload = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
};

export function isBlogPostPayload(value: unknown): value is BlogPostPayload;
export function halloweenArtForPostId(postId: string): string;
export function initialsFromName(name: string): string;
export function formatPostDate(iso: string): string;
export function createLivePostCard(
  payload: BlogPostPayload,
  signedIn: boolean,
): unknown;
export function insertBlogPost(feed: unknown, payload: unknown): boolean;
export function initSocketFeed(): unknown;
