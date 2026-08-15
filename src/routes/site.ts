import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/web.js";
import {
  createComment,
  createPost,
  deletePost,
  getComments,
  getPost,
  getProfile,
  getTimeline,
  toggleReaction,
  updateProfile,
} from "../services/posts.js";
import { getUniqueVisitorCount } from "../services/visitors.js";
import { commentSchema, firstError, postSchema, profileSchema } from "../utils/validation.js";

export const siteRouter = Router();
const uuidSchema = z.uuid();

siteRouter.get("/", async (req, res) => {
  const [posts, visitorCount] = await Promise.all([
    getTimeline(req.currentUser?.id ?? null),
    getUniqueVisitorCount(req, res),
  ]);
  res.render("home", { title: "Your timeline", posts, visitorCount, composeError: null });
});

siteRouter.post("/posts", requireAuth, async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    const [posts, visitorCount] = await Promise.all([
      getTimeline(req.currentUser?.id ?? null),
      getUniqueVisitorCount(req, res),
    ]);
    return res.status(422).render("home", {
      title: "Your timeline",
      posts,
      visitorCount,
      composeError: firstError(parsed.error),
    });
  }

  const postId = await createPost(req.currentUser!.id, parsed.data.content);
  req.session.flash = { kind: "success", message: "Posted to your diary." };
  return res.redirect(303, postId ? `/posts/${postId}` : "/");
});

siteRouter.get("/posts/:postId", async (req, res) => {
  const parsedId = uuidSchema.safeParse(req.params.postId);
  if (!parsedId.success) return renderNotFound(res);

  const [post, comments] = await Promise.all([
    getPost(parsedId.data, req.currentUser?.id ?? null),
    getComments(parsedId.data),
  ]);
  if (!post) return renderNotFound(res);

  return res.render("posts/show", { title: `Post by ${post.authorDisplayName}`, post, comments, error: null });
});

siteRouter.post("/posts/:postId/comments", requireAuth, async (req, res) => {
  const parsedId = uuidSchema.safeParse(req.params.postId);
  if (!parsedId.success) return renderNotFound(res);
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    const [post, comments] = await Promise.all([
      getPost(parsedId.data, req.currentUser?.id ?? null),
      getComments(parsedId.data),
    ]);
    if (!post) return renderNotFound(res);
    return res.status(422).render("posts/show", {
      title: `Post by ${post.authorDisplayName}`,
      post,
      comments,
      error: firstError(parsed.error),
    });
  }
  await createComment(parsedId.data, req.currentUser!.id, parsed.data.body);
  return res.redirect(303, `/posts/${parsedId.data}#comments`);
});

siteRouter.post("/posts/:postId/delete", requireAuth, async (req, res) => {
  const parsedId = uuidSchema.safeParse(req.params.postId);
  if (!parsedId.success) return renderNotFound(res);
  const deleted = await deletePost(parsedId.data, req.currentUser!.id);
  if (!deleted) {
    return res.status(403).render("errors/error", {
      title: "Not allowed",
      status: 403,
      message: "Only the author can delete this post.",
    });
  }
  req.session.flash = { kind: "success", message: "Post deleted." };
  return res.redirect(303, "/");
});

siteRouter.post("/api/posts/:postId/:reaction", requireAuth, async (req, res) => {
  const parsedId = uuidSchema.safeParse(req.params.postId);
  const reaction = req.params.reaction;
  if (!parsedId.success || (reaction !== "like" && reaction !== "repost")) {
    return res.status(404).json({ error: "Not found." });
  }
  const result = await toggleReaction(
    reaction === "like" ? "likes" : "reposts",
    parsedId.data,
    req.currentUser!.id,
  );
  return res.json(result);
});

siteRouter.get("/u/:username", async (req, res) => {
  const profile = await getProfile(firstParam(req.params.username), req.currentUser?.id ?? null);
  if (!profile) return renderNotFound(res);
  return res.render("profiles/show", { title: profile.user.displayName, ...profile, error: null });
});

siteRouter.post("/u/:username", requireAuth, async (req, res) => {
  if (firstParam(req.params.username).toLowerCase() !== req.currentUser!.username) {
    return res.status(403).render("errors/error", {
      title: "Not allowed",
      status: 403,
      message: "You can only customize your own profile.",
    });
  }
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    const profile = await getProfile(req.currentUser!.username, req.currentUser!.id);
    if (!profile) return renderNotFound(res);
    return res.status(422).render("profiles/show", {
      title: profile.user.displayName,
      ...profile,
      error: firstError(parsed.error),
    });
  }
  await updateProfile(req.currentUser!.id, parsed.data);
  req.session.flash = { kind: "success", message: "Profile saved." };
  return res.redirect(303, `/u/${req.currentUser!.username}`);
});

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function renderNotFound(res: Response) {
  return res.status(404).render("errors/error", {
    title: "Page not found",
    status: 404,
    message: "That page drifted off the information superhighway.",
  });
}
