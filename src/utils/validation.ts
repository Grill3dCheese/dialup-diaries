import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers, and underscores."),
  displayName: z.string().trim().min(1, "Display name is required.").max(50),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(128)
    .regex(/[a-z]/, "Add a lowercase letter.")
    .regex(/[A-Z]/, "Add an uppercase letter.")
    .regex(/[0-9]/, "Add a number."),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(24),
  password: z.string().min(1).max(128),
});

export const postSchema = z.object({
  content: z.string().trim().min(1, "Write something first.").max(5000, "Posts are limited to 5,000 characters."),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Your comment is empty.").max(1000),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  bio: z.string().trim().max(280),
});

export function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check your input.";
}
