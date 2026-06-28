import { z } from "zod";

export const audienceSchema = z.enum(["all", "owners", "tenants"]);
export type Audience = z.infer<typeof audienceSchema>;

export const createNoticeInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  audience: audienceSchema.default("all"),
  pinned: z.boolean().default(false),
  publishAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type CreateNoticeInput = z.infer<typeof createNoticeInputSchema>;

export const updateNoticeInputSchema = createNoticeInputSchema.partial();
export type UpdateNoticeInput = z.infer<typeof updateNoticeInputSchema>;

export type Notice = {
  id: string;
  societyId: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};
