import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertContactMessage, InsertTopicComment, InsertUser, contactMessages, topicComments, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createContactMessage(message: InsertContactMessage): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(contactMessages).values(message);
}

export function normalizeTopicCommentAuthor(authorName: string | null | undefined): string {
  return authorName?.trim() || "探索者";
}

export async function getTopicComments(topicId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db
    .select({
      id: topicComments.id,
      topicId: topicComments.topicId,
      userId: topicComments.userId,
      authorName: topicComments.authorName,
      body: topicComments.body,
      createdAt: topicComments.createdAt,
      updatedAt: topicComments.updatedAt,
    })
    .from(topicComments)
    .where(eq(topicComments.topicId, topicId))
    .orderBy(desc(topicComments.createdAt), desc(topicComments.id))
    .limit(100);

  return rows.map((row) => ({
    ...row,
    authorName: normalizeTopicCommentAuthor(row.authorName),
  }));
}

export async function createTopicComment(comment: InsertTopicComment): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(topicComments).values(comment);
}

export async function deleteTopicComment(commentId: number, userId: number): Promise<"deleted" | "not_found" | "forbidden"> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const existing = await db
    .select({ userId: topicComments.userId })
    .from(topicComments)
    .where(eq(topicComments.id, commentId))
    .limit(1);
  if (existing.length === 0) return "not_found";
  if (existing[0].userId !== userId) return "forbidden";

  await db.delete(topicComments).where(and(eq(topicComments.id, commentId), eq(topicComments.userId, userId)));
  return "deleted";
}
