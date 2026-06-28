import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { notices } from "../schema.js";

export type NoticeAudience = "all" | "owners" | "tenants";

export type CreateNoticeInput = {
  societyId: string;
  title: string;
  body: string;
  audience?: NoticeAudience;
  pinned?: boolean;
  publishAt?: Date;
  expiresAt?: Date | null;
};

export type UpdateNoticeInput = Partial<Omit<CreateNoticeInput, "societyId">>;

export async function createNotice(db: Database, input: CreateNoticeInput) {
  const [row] = await db
    .insert(notices)
    .values({
      societyId: input.societyId,
      title: input.title,
      body: input.body,
      audience: input.audience ?? "all",
      pinned: input.pinned ?? false,
      publishAt: input.publishAt ?? new Date(),
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return row;
}

export async function findNoticeById(db: Database, id: string) {
  const [row] = await db.select().from(notices).where(eq(notices.id, id));
  return row;
}

export async function listActiveNotices(db: Database, opts: { now?: Date; audiences?: NoticeAudience[] } = {}) {
  const now = opts.now ?? new Date();
  const audienceFilter = opts.audiences && opts.audiences.length > 0
    ? sql`${notices.audience} = ANY(${sql.raw(`ARRAY[${opts.audiences.map((a) => `'${a}'`).join(",")}]`)})`
    : undefined;

  return db
    .select()
    .from(notices)
    .where(
      and(
        lte(notices.publishAt, now),
        or(isNull(notices.expiresAt), gt(notices.expiresAt, now)),
        audienceFilter,
      ),
    )
    .orderBy(desc(notices.pinned), desc(notices.publishAt));
}

export async function listAllNotices(db: Database) {
  return db.select().from(notices).orderBy(desc(notices.pinned), desc(notices.publishAt));
}

export async function updateNotice(db: Database, id: string, input: UpdateNoticeInput) {
  const [row] = await db
    .update(notices)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.audience !== undefined && { audience: input.audience }),
      ...(input.pinned !== undefined && { pinned: input.pinned }),
      ...(input.publishAt !== undefined && { publishAt: input.publishAt }),
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
      updatedAt: new Date(),
    })
    .where(eq(notices.id, id))
    .returning();
  return row;
}

export async function deleteNotice(db: Database, id: string) {
  await db.delete(notices).where(eq(notices.id, id));
}
