import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql, { type Pool } from "mysql2";
import { InsertContactMessage, InsertTopicComment, InsertUser, contactMessages, topicComments, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;
const DEFAULT_DATABASE = "test";

function createDatabasePool(databaseUrl: string): Pool {
  const url = new URL(databaseUrl);
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
    || process.env.DATABASE_NAME
    || DEFAULT_DATABASE;

  console.log("[Database] Initializing MySQL pool", {
    host: url.hostname,
    port: url.port || "4000",
    database,
    tls: true,
  });

  return mysql.createPool({
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    // TiDB Cloud prohibits insecure transport. Keep certificate verification
    // enabled by default; only explicitly opt out for a controlled test setup.
    ssl: { rejectUnauthorized },
  });
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = createDatabasePool(process.env.DATABASE_URL);
      _db = drizzle(_pool);
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

    const textFields = ["name", "email", "avatarUrl", "loginMethod"] as const;
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

    // Keep the OAuth write path explicitly MySQL-compatible. This avoids any
    // runtime adapter/bundle ambiguity and makes the TiDB quoting unambiguous.
    if (!_pool) throw new Error("Database pool is not available");
    const insertColumns = Object.keys(values) as Array<keyof InsertUser>;
    const updateColumns = Object.keys(updateSet) as Array<keyof InsertUser>;
    const quote = (column: string) => `\`${column}\``;
    const insertSql = `INSERT INTO ${quote("users")} (${insertColumns.map(quote).join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`;
    const updateSql = updateColumns.length > 0
      ? ` ON DUPLICATE KEY UPDATE ${updateColumns.map(column => `${quote(column)} = ?`).join(", ")}`
      : "";
    const insertParams = insertColumns.map(column => values[column]);
    const updateParams = updateColumns.map(column => updateSet[column]);
    await _pool.promise().query(insertSql + updateSql, [...insertParams, ...updateParams]);
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

export async function getTopicComments(topicId: string, userId: number | null = null, anonymousToken: string | null = null) {
  if (!_pool) await getDb();
  if (!_pool) throw new Error("Database is not available");

  // TiDB's deployed table uses camelCase physical column names. Keep this
  // read path explicit so a stale ORM dialect cannot turn identifiers into
  // string literals or silently translate them to snake_case.
  const [rawRows] = await _pool.promise().query(
    "SELECT `id`, `topicId`, `userId`, `authorName`, `anonymousToken`, `avatarId`, `body`, `createdAt`, `updatedAt` FROM `topic_comments` WHERE `topicId` = ? ORDER BY `createdAt` DESC, `id` DESC LIMIT 100",
    [topicId],
  );
  const rows = rawRows as Array<{
    id: number;
    topicId: string;
    userId: number | null;
    authorName: string | null;
    anonymousToken: string | null;
    avatarId: string | null;
    body: string;
    createdAt: Date;
    updatedAt: Date;
  }>;

  return rows.map(({ anonymousToken: storedToken, ...row }) => ({
    ...row,
    anonymousToken: storedToken,
    authorName: normalizeTopicCommentAuthor(row.authorName),
    canDelete: userId !== null ? row.userId === userId : row.userId === null && Boolean(anonymousToken) && storedToken === anonymousToken,
  }));
}

export async function getAdminComments(search = "") {
  if (!_pool) await getDb();
  if (!_pool) throw new Error("Database is not available");

  const normalizedSearch = search.trim();
  const conditions = normalizedSearch ? "WHERE `topicId` LIKE ? OR `authorName` LIKE ? OR `body` LIKE ?" : "";
  const searchValue = `%${normalizedSearch}%`;
  const [rawRows] = await _pool.promise().query(
    `SELECT \`id\`, \`topicId\`, \`userId\`, \`authorName\`, \`anonymousToken\`, \`avatarId\`, \`body\`, \`createdAt\`, \`updatedAt\` FROM \`topic_comments\` ${conditions} ORDER BY \`createdAt\` DESC, \`id\` DESC LIMIT 500`,
    normalizedSearch ? [searchValue, searchValue, searchValue] : [],
  );
  return rawRows as Array<{
    id: number;
    topicId: string;
    userId: number | null;
    authorName: string | null;
    anonymousToken: string | null;
    avatarId: string | null;
    body: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

export async function deleteTopicCommentAsAdmin(commentId: number): Promise<"deleted" | "not_found"> {
  if (!_pool) await getDb();
  if (!_pool) throw new Error("Database is not available");

  const [result] = await _pool.promise().query("DELETE FROM `topic_comments` WHERE `id` = ?", [commentId]);
  const affectedRows = (result as { affectedRows?: number }).affectedRows ?? 0;
  return affectedRows > 0 ? "deleted" : "not_found";
}

export async function createTopicComment(comment: InsertTopicComment): Promise<void> {
  if (!_pool) await getDb();
  if (!_pool) throw new Error("Database is not available");

  // Keep anonymous writes explicit for TiDB/Vercel. This avoids a deployed
  // Drizzle dialect translating nullable camelCase columns unexpectedly.
  await _pool.promise().query(
    "INSERT INTO `topic_comments` (`topicId`, `userId`, `anonymousToken`, `authorName`, `avatarId`, `body`) VALUES (?, ?, ?, ?, ?, ?)",
    [comment.topicId, comment.userId ?? null, comment.anonymousToken ?? null, comment.authorName ?? null, comment.avatarId ?? null, comment.body],
  );
}

export async function deleteTopicComment(
  commentId: number,
  userId: number | null,
  anonymousToken: string | null = null,
): Promise<"deleted" | "not_found" | "forbidden"> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const existing = await db
    .select({ userId: topicComments.userId, anonymousToken: topicComments.anonymousToken })
    .from(topicComments)
    .where(eq(topicComments.id, commentId))
    .limit(1);
  if (existing.length === 0) return "not_found";

  const ownsComment = userId !== null
    ? existing[0].userId === userId
    : existing[0].userId === null && Boolean(anonymousToken) && existing[0].anonymousToken === anonymousToken;
  if (!ownsComment) return "forbidden";

  const ownerCondition = userId !== null
    ? eq(topicComments.userId, userId)
    : eq(topicComments.anonymousToken, anonymousToken as string);
  await db.delete(topicComments).where(and(eq(topicComments.id, commentId), ownerCondition));
  return "deleted";
}

export async function updateTopicComment(
  commentId: number,
  body: string,
  anonymousToken: string,
): Promise<"updated" | "not_found" | "forbidden"> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const existing = await db
    .select({ anonymousToken: topicComments.anonymousToken })
    .from(topicComments)
    .where(eq(topicComments.id, commentId))
    .limit(1);
  if (existing.length === 0) return "not_found";
  if (!existing[0].anonymousToken || existing[0].anonymousToken !== anonymousToken) return "forbidden";

  await db
    .update(topicComments)
    .set({ body, updatedAt: new Date() })
    .where(and(eq(topicComments.id, commentId), eq(topicComments.anonymousToken, anonymousToken)));
  return "updated";
}
