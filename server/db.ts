import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql, { type Pool } from "mysql2";
import { InsertContactMessage, InsertTopicComment, InsertUser, contactMessages, topicComments, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;
let topicCommentsSchemaPromise: Promise<void> | null = null;
let topicCommentsColumns: Set<string> | null = null;
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

async function ensureTopicCommentsSchema() {
  if (!_pool) await getDb();
  if (!_pool) throw new Error("Database is not available");
  if (!topicCommentsSchemaPromise) {
    topicCommentsSchemaPromise = (async () => {
      const pool = _pool;
      if (!pool) throw new Error("Database is not available");
      const [rawUserIdColumns] = await pool.promise().query("SHOW COLUMNS FROM `users` LIKE 'id'");
      const userIdColumns = rawUserIdColumns as Array<{ Type: string }>;
      const referencedType = userIdColumns[0]?.Type ?? "int";
      const [rawColumns] = await pool.promise().query("SHOW COLUMNS FROM `topic_comments`");
      const columns = rawColumns as Array<{ Field: string; Type: string; Null: string }>;
      topicCommentsColumns = new Set(columns.map((column) => column.Field));
      const userIdColumn = columns.find((column) => column.Field === "userId");
      const avatarIdColumn = columns.find((column) => column.Field === "avatarId");
      const clearStatusColumn = columns.find((column) => column.Field === "clearStatus");
      const hasSpoilerColumn = columns.find((column) => column.Field === "hasSpoiler");

      const [foreignKeys] = await pool.promise().query(
        "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'topic_comments' AND CONSTRAINT_NAME = 'topic_comments_user_id_fk'",
      );
      if ((foreignKeys as Array<{ CONSTRAINT_NAME: string }>).length > 0) {
        await pool.promise().query("ALTER TABLE `topic_comments` DROP FOREIGN KEY `topic_comments_user_id_fk`");
      }

      if (!userIdColumn) {
        await pool.promise().query("ALTER TABLE `topic_comments` ADD COLUMN `userId` INT NULL AFTER `topicId`");
        topicCommentsColumns.add("userId");
      } else if (userIdColumn.Null !== "YES" || userIdColumn.Type.toLowerCase() !== referencedType.toLowerCase()) {
        await pool.promise().query("ALTER TABLE `topic_comments` MODIFY COLUMN `userId` INT NULL");
      }
      if (!avatarIdColumn) {
        await pool.promise().query("ALTER TABLE `topic_comments` ADD COLUMN `avatarId` VARCHAR(32) NULL AFTER `authorName`");
        topicCommentsColumns.add("avatarId");
      } else if (!/^varchar\(32\)/i.test(avatarIdColumn.Type)) {
        await pool.promise().query("ALTER TABLE `topic_comments` MODIFY COLUMN `avatarId` VARCHAR(32) NULL");
      }
      if (!clearStatusColumn) {
        await pool.promise().query("ALTER TABLE `topic_comments` ADD COLUMN `clearStatus` VARCHAR(16) NOT NULL DEFAULT 'none' AFTER `body`");
        topicCommentsColumns.add("clearStatus");
      }
      if (!hasSpoilerColumn) {
        await pool.promise().query("ALTER TABLE `topic_comments` ADD COLUMN `hasSpoiler` INT NOT NULL DEFAULT 0 AFTER `clearStatus`");
        topicCommentsColumns.add("hasSpoiler");
      }
    })().catch((error) => {
      topicCommentsSchemaPromise = null;
      throw error;
    });
  }
  await topicCommentsSchemaPromise;
}

export async function getTopicComments(topicId: string, userId: number | null = null, anonymousToken: string | null = null) {
  await ensureTopicCommentsSchema();
  const pool = _pool;
  if (!pool) throw new Error("Database is not available");

  // TiDB's deployed table uses camelCase physical column names. Keep this
  // read path explicit so a stale ORM dialect cannot turn identifiers into
  // string literals or silently translate them to snake_case.
  const [rawRows] = await pool.promise().query(
    "SELECT `id`, `topicId`, `userId`, `authorName`, `anonymousToken`, `avatarId`, `body`, `clearStatus`, `hasSpoiler`, `createdAt`, `updatedAt` FROM `topic_comments` WHERE `topicId` = ? ORDER BY `createdAt` DESC, `id` DESC LIMIT 100",
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
    clearStatus: string | null;
    hasSpoiler: number | boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;

  return rows.map(({ anonymousToken: storedToken, ...row }) => ({
    ...row,
    anonymousToken: storedToken,
    authorName: normalizeTopicCommentAuthor(row.authorName),
    clearStatus: row.clearStatus === "success" || row.clearStatus === "failed" ? row.clearStatus : "none",
    hasSpoiler: Boolean(row.hasSpoiler),
    canDelete: userId !== null ? row.userId === userId : row.userId === null && Boolean(anonymousToken) && storedToken === anonymousToken,
  }));
}

export async function getAdminComments(search = "") {
  await ensureTopicCommentsSchema();
  const pool = _pool;
  if (!pool) throw new Error("Database is not available");

  const normalizedSearch = search.trim();
  const conditions = normalizedSearch ? "WHERE `topicId` LIKE ? OR `authorName` LIKE ? OR `body` LIKE ?" : "";
  const searchValue = `%${normalizedSearch}%`;
  const [rawRows] = await pool.promise().query(
    `SELECT \`id\`, \`topicId\`, \`userId\`, \`authorName\`, \`anonymousToken\`, \`avatarId\`, \`body\`, \`clearStatus\`, \`hasSpoiler\`, \`createdAt\`, \`updatedAt\` FROM \`topic_comments\` ${conditions} ORDER BY \`createdAt\` DESC, \`id\` DESC LIMIT 500`,
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
    clearStatus: string;
    hasSpoiler: number;
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
  await ensureTopicCommentsSchema();
  const pool = _pool;
  if (!pool) throw new Error("Database is not available");

  // Keep anonymous writes explicit for TiDB/Vercel. This avoids a deployed
  // Drizzle dialect translating nullable camelCase columns unexpectedly.
  const columns = ["topicId", "userId", "anonymousToken", "authorName", "avatarId", "body", "clearStatus", "hasSpoiler"];
  const values: unknown[] = [comment.topicId, comment.userId ?? null, comment.anonymousToken ?? null, comment.authorName ?? null, comment.avatarId ?? null, comment.body, comment.clearStatus ?? "none", comment.hasSpoiler ? 1 : 0];
  if (topicCommentsColumns?.has("content")) {
    columns.push("content");
    values.push(comment.body);
  }
  const quotedColumns = columns.map((column) => `\`${column}\``).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  await pool.promise().query(
    `INSERT INTO \`topic_comments\` (${quotedColumns}) VALUES (${placeholders})`,
    values,
  );
}

export async function getLatestTopicCommentByAnonymousToken(anonymousToken: string): Promise<Date | null> {
  await ensureTopicCommentsSchema();
  const pool = _pool;
  if (!pool) throw new Error("Database is not available");

  const [rawRows] = await pool.promise().query(
    "SELECT `createdAt` FROM `topic_comments` WHERE `anonymousToken` = ? ORDER BY `createdAt` DESC, `id` DESC LIMIT 1",
    [anonymousToken],
  );
  const rows = rawRows as Array<{ createdAt: Date | string }>;
  if (!rows[0]?.createdAt) return null;
  const createdAt = new Date(rows[0].createdAt);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
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
