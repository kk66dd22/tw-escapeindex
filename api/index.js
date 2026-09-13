// server/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/routers.ts
import { parse as parseCookie } from "cookie";
import { randomUUID } from "node:crypto";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var DEFAULT_OAUTH_SERVER_URL = "https://api.manus.im";
function normalizeBaseUrl(value) {
  return value?.trim().replace(/\/+$/, "") || "";
}
function resolveOAuthServerUrl(env = process.env) {
  return normalizeBaseUrl(
    env.OAUTH_SERVER_URL || env.MANUS_OAUTH_SERVER_URL || env.BUILT_IN_FORGE_API_URL
  ) || DEFAULT_OAUTH_SERVER_URL;
}
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: resolveOAuthServerUrl(),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/db.ts
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Google profile image URL; nullable for accounts without a profile image. */
  avatarUrl: text("avatarUrl"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var contactMessages = mysqlTable("contact_messages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }),
  email: varchar("email", { length: 320 }),
  subject: varchar("subject", { length: 80 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var topicComments = mysqlTable("topic_comments", {
  id: int("id").autoincrement().primaryKey(),
  topicId: varchar("topicId", { length: 64 }).notNull(),
  userId: int("userId"),
  anonymousToken: varchar("anonymousToken", { length: 64 }),
  authorName: varchar("authorName", { length: 120 }),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/db.ts
var _db = null;
var _pool = null;
var DEFAULT_DATABASE = "test";
function createDatabasePool(databaseUrl) {
  const url = new URL(databaseUrl);
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || process.env.DATABASE_NAME || DEFAULT_DATABASE;
  console.log("[Database] Initializing MySQL pool", {
    host: url.hostname,
    port: url.port || "4000",
    database,
    tls: true
  });
  return mysql.createPool({
    host: url.hostname,
    port: url.port ? Number(url.port) : 4e3,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    // TiDB Cloud prohibits insecure transport. Keep certificate verification
    // enabled by default; only explicitly opt out for a controlled test setup.
    ssl: { rejectUnauthorized }
  });
}
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "avatarUrl", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (!_pool) throw new Error("Database pool is not available");
    const insertColumns = Object.keys(values);
    const updateColumns = Object.keys(updateSet);
    const quote = (column) => `\`${column}\``;
    const insertSql = `INSERT INTO ${quote("users")} (${insertColumns.map(quote).join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`;
    const updateSql = updateColumns.length > 0 ? ` ON DUPLICATE KEY UPDATE ${updateColumns.map((column) => `${quote(column)} = ?`).join(", ")}` : "";
    const insertParams = insertColumns.map((column) => values[column]);
    const updateParams = updateColumns.map((column) => updateSet[column]);
    await _pool.promise().query(insertSql + updateSql, [...insertParams, ...updateParams]);
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createContactMessage(message) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(contactMessages).values(message);
}
function normalizeTopicCommentAuthor(authorName) {
  return authorName?.trim() || "\u63A2\u7D22\u8005";
}
async function getTopicComments(topicId, userId = null, anonymousToken = null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({
    id: topicComments.id,
    topicId: topicComments.topicId,
    userId: topicComments.userId,
    authorName: topicComments.authorName,
    avatarUrl: users.avatarUrl,
    anonymousToken: topicComments.anonymousToken,
    body: topicComments.body,
    createdAt: topicComments.createdAt,
    updatedAt: topicComments.updatedAt
  }).from(topicComments).leftJoin(users, eq(topicComments.userId, users.id)).where(eq(topicComments.topicId, topicId)).orderBy(desc(topicComments.createdAt), desc(topicComments.id)).limit(100);
  return rows.map(({ anonymousToken: storedToken, ...row }) => ({
    ...row,
    authorName: normalizeTopicCommentAuthor(row.authorName),
    canDelete: userId !== null ? row.userId === userId : row.userId === null && Boolean(anonymousToken) && storedToken === anonymousToken
  }));
}
async function createTopicComment(comment) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(topicComments).values(comment);
}
async function deleteTopicComment(commentId, userId, anonymousToken = null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await db.select({ userId: topicComments.userId, anonymousToken: topicComments.anonymousToken }).from(topicComments).where(eq(topicComments.id, commentId)).limit(1);
  if (existing.length === 0) return "not_found";
  const ownsComment = userId !== null ? existing[0].userId === userId : existing[0].userId === null && Boolean(anonymousToken) && existing[0].anonymousToken === anonymousToken;
  if (!ownsComment) return "forbidden";
  const ownerCondition = userId !== null ? eq(topicComments.userId, userId) : eq(topicComments.anonymousToken, anonymousToken);
  await db.delete(topicComments).where(and(eq(topicComments.id, commentId), ownerCondition));
  return "deleted";
}

// data/topics.json
var topics_default = [
  {
    id: "popular-001",
    name: "\u4E5D\u9F8D\u5BE8\u57CE",
    venue_name: "LOST Taiwan \u8FF7\u306E\u5BC6\u5931",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF\uFF0F\u5927\u5B89\uFF0F\u4E2D\u6B63",
    google_rating: 4.8,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    booking_url: "https://losttw.com/",
    source_urls: [
      "https://losttw.com/",
      "https://www.myfunnow.com/zh-tw/branches/3050710159112"
    ],
    google_place_id: "ChIJv6_XQfepQjQRjhlaS_bSCmo",
    google_review_count: 534,
    google_rating_checked_at: "2026-08-19T06:53:36.184Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "100\u53F0\u7063\u81FA\u5317\u5E02\u4E2D\u6B63\u5340\u9ECE\u660E\u91CC\u8A31\u660C\u885730\u865F7\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u4E5D\u9F8D\u5BE8\u57CE\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-002",
    name: "\u731B\u9B3C\u5927\u5EC8",
    venue_name: "LOST Taiwan \u8FF7\u306E\u5BC6\u5931",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF\uFF0F\u5927\u5B89\uFF0F\u4E2D\u6B63",
    google_rating: 4.8,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 5,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u771F\u4EBA\u4E92\u52D5"
    ],
    pros: [
      "\u8A2D\u6709\u771F\u4EBA\u4E92\u52D5\u5143\u7D20",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    booking_url: "https://losttw.com/",
    source_urls: [
      "https://losttw.com/",
      "https://www.myfunnow.com/zh-tw/branches/3050710159112"
    ],
    google_place_id: "ChIJv6_XQfepQjQRjhlaS_bSCmo",
    google_review_count: 534,
    google_rating_checked_at: "2026-08-19T06:53:36.184Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "100\u53F0\u7063\u81FA\u5317\u5E02\u4E2D\u6B63\u5340\u9ECE\u660E\u91CC\u8A31\u660C\u885730\u865F7\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u731B\u9B3C\u5927\u5EC8\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74 7 \u6708"
  },
  {
    id: "popular-003",
    name: "\u6F5B\u5165\u4EFB\u52D9",
    venue_name: "LOST Taiwan \u8FF7\u306E\u5BC6\u5931",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF\uFF0F\u5927\u5B89\uFF0F\u4E2D\u6B63",
    google_rating: 4.8,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 4,
    styles: [
      "\u4EFB\u52D9\u63A8\u7406",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    booking_url: "https://losttw.com/",
    source_urls: [
      "https://losttw.com/",
      "https://www.myfunnow.com/zh-tw/branches/3050710159112"
    ],
    google_place_id: "ChIJv6_XQfepQjQRjhlaS_bSCmo",
    google_review_count: 534,
    google_rating_checked_at: "2026-08-19T06:53:36.184Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "100\u53F0\u7063\u81FA\u5317\u5E02\u4E2D\u6B63\u5340\u9ECE\u660E\u91CC\u8A31\u660C\u885730\u865F7\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6F5B\u5165\u4EFB\u52D9\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-004",
    name: "\u767E\u9B3C\u591C\u884C",
    venue_name: "EnterSpace \u5BC6\u5BA4\u9003\u812B",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71\uFF0F\u5927\u76F4",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 3,
    brain: 4,
    styles: [
      "\u65E5\u7CFB\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.enterspace.tw/",
    source_urls: [
      "https://www.enterspace.tw/",
      "https://www.instagram.com/reel/DCrFD2-TV8y/"
    ],
    google_place_id: "ChIJUx5wqQ-sQjQRCFs-DKqgcJ0",
    google_review_count: 5831,
    google_rating_checked_at: "2026-08-19T06:53:32.932Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "104\u53F0\u7063\u81FA\u5317\u5E02\u4E2D\u5C71\u5340\u6C38\u5B89\u91CC\u660E\u6C34\u8DEF581\u5DF715\u865FB1",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u767E\u9B3C\u591C\u884C\u300B\u4EE5\u5718\u968A\u5408\u4F5C\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u904A\u6232\u6642\u9593\u8207\u4EBA\u6578\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://www.enterspace.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u9003\u812B | \u5BE6\u5883\u9AD4\u9A57 EnterSpace \u5BC6\u5BA4\u9003\u812B | \u5BE6\u5883\u9AD4\u9A57 \u9996\u9801 \u5BC6\u5BA4\u9003\u812B\u904A\u6232 \u904A\u6232\u7E3D\u89BD \u5FAE\u7B11\u8B0E\u85CF \u4EE5\u738B\u4E4B\u540D Vicky \u5B87\u5B99\u812B\u9003 CONE \u63A7\u5236\u7344 \u6D1B\u514B\u98EF\u5E97\uFF1A\u6BBA\u624B\u56F0\u5883 \u6D1B\u514B\u98EF\u5E97\uFF1A\u7DAD\u591A\u8389\u4E9E\u7684\u7955\u5BC6 \u7D05\u8863\u5C0F\u5973\u5B69 \u5669\u5922\u518D\u898B \u838E\u58EB\u6BD4\u4E9E\u7684\u9080\u8ACB \u767E\u9B3C\u591C\u884C \u63A5\u62DB\u5427\uFF01\u6C7A\u6230\u9664\u5915\u591C\uFF01 \u88AB\u5BA2\u4EBA\u7F75\u7206\u7684\u6211 \u6C7A\u5B9A\u8981\u9006\u5929\u6539\u547D \u916C\u9B3C\u6232 \u5927\u76F4\u5357\u5E02\u5834 \u904E\u5F80\u904A\u6232 \u751F\u5B58\u904A\u6232 \u76AE\u514B\u8499\u4E4B\u66F8 \u7834\u7247\u63A8\u7406 \u5718\u968A\u4ECB\u7D39 \u4EA4\u901A\u8CC7\u8A0A \u6700\u65B0\u6D3B\u52D5 \u4F01\u696D\u5305\u5834 FB \u6210\u70BA\u8AAA\u66F8\u4EBA \u5BC6\u5BA4\u9003\u812B\u904A\u6232 \u904A\u6232\u7E3D\u89BD \u5FAE\u7B11\u8B0E\u85CF \u4EE5\u738B\u4E4B\u540D Vicky \u5B87\u5B99\u812B\u9003 CONE \u63A7\u5236\u7344 \u6D1B\u514B\u98EF\u5E97\uFF1A\u6BBA\u624B\u56F0\u5883 \u6D1B\u514B\u98EF\u5E97\uFF1A\u7DAD\u591A\u8389\u4E9E\u7684\u7955\u5BC6 \u7D05\u8863\u5C0F\u5973\u5B69 \u5669\u5922\u518D\u898B \u838E\u58EB\u6BD4\u4E9E\u7684\u9080\u8ACB \u767E\u9B3C\u591C\u884C \u63A5\u62DB\u5427\uFF01\u6C7A\u6230\u9664\u5915\u591C \u88AB\u5BA2\u4EBA\u7F75\u7206\u7684\u6211 \u6C7A\u5B9A\u8981\u9006\u5929\u6539\u547D \u916C\u9B3C\u6232 \u5927\u76F4\u5357\u5E02\u5834 \u904E\u5F80\u904A\u6232 \u76AE\u514B",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74 10 \u6708"
  },
  {
    id: "popular-005",
    name: "\u9B54\u5E7B\u83DC\u5E02\u5834",
    venue_name: "EnterSpace \u5BC6\u5BA4\u9003\u812B",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71\uFF0F\u5927\u76F4",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 3,
    styles: [
      "\u5947\u5E7B\u5192\u96AA",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.enterspace.tw/",
    source_urls: [
      "https://www.enterspace.tw/",
      "https://www.instagram.com/reel/DCrFD2-TV8y/"
    ],
    google_place_id: "ChIJUx5wqQ-sQjQRCFs-DKqgcJ0",
    google_review_count: 5831,
    google_rating_checked_at: "2026-08-19T06:53:32.932Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "104\u53F0\u7063\u81FA\u5317\u5E02\u4E2D\u5C71\u5340\u6C38\u5B89\u91CC\u660E\u6C34\u8DEF581\u5DF715\u865FB1",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u9B54\u5E7B\u83DC\u5E02\u5834\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://www.enterspace.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u7121\u6578\u795E\u79D8\u7684\u5927\u9580\uFF0C\u9580\u5F8C\u5B55\u80B2\u773E\u591A\u6545\u4E8B\u7684\u8D77\u6E90\uFF0C \u66F4\u662F\u8C61\u5FB5\u5D84\u65B0\u5192\u96AA\u7684\u8D77\u9EDE\u3002 \u200D \u9078\u64C7\u4E00\u6247\u9580\u8D70\u5165\u53E6\u500B\u65B0\u4E16\u754C\uFF0C\u5275\u9020\u4E00\u500B\u53C8\u4E00\u500B\u5168\u65B0\u7684\u6545\u4E8B\u8207\u50B3\u8AAA\u5427\uFF01 \u7ACB\u5373\u5C55\u958B\u5192\u96AA scroll \u904E\u5E74\u63A5\u62DB\u4E86\uFF01 \u70BA\u4E86\u8CB7\u6700\u65B0\u578B\u7684\u904A\u6232\u6A5F\uFF0C \u5C0F\u53D4\u53D4\u5927\u59D1\u59D1\u5011\uFF0C\u5F97\u7F6A\u5566\uFF01 \u6436\u7D05\u5305\u56C9 \u200D \u9B54\u5E7B\u83DC\u5E02\u5834 \u4F86\u5230\u9019\u5EA7\u5E02\u5834\u5F8C \u6BCF\u4EF6\u4E8B\u90FD\u5728\u6084\u6084\u6539\u8B8A... \u8CB7\u83DC\u8CB7\u8089 \u65E5\u7CFB\u89E3\u8B0E \u767E\u5E74\u4E00\u6B21\u7684\u300C\u767E\u9B3C\u591C\u884C\u300D\uFF0C \u4EBA\u754C\u8207\u5996\u754C\u5C07\u6703\u77ED\u66AB\u91CD\u758A... \u5C0B\u627E\u9577\u751F\u4E4B\u6CD5 \u5E74\u8F15\u4EBA\u5C08\u5C6C 2026\u300C\u6587\u5316\u5E63\u300D\u73A9\u5BC6\u5BA4 \u5168\u9928\u5BC6\u5BA4\u76F4\u63A5\u6298\u6263\uFF01 \u7528\u6587\u5316\u5E63 \u66F4\u5212\u7B97 15 \u6B3E\u4E3B\u984C\u4EFB\u52D9\u7B49\u4F60\u6311\u6230 \u5BC6\u5BA4\u9003\u812B \u5728\u5404\u7A2E\u4E0D\u540C\u98A8\u683C\u7684\u4E3B\u984C\u4E2D\uFF0C\u9AD4\u9A57\u771F\u5BE6\u7684\u6545\u4E8B\u5834\u666F\uFF0C\u8207\u5925\u4F34\u4E00\u8D77\u4E92\u76F8\u8A0E\u8AD6\u3001\u4EA4\u63DB\u8CC7\u8A0A\u3001\u5C0B\u627E\u7DDA\u7D22\u3002 \u85C9\u7531\u89E3\u958B\u5404\u7A2E\u5F62\u5F0F\u7684\u8B0E\u984C\u8207\u95DC\u5361\uFF0C\u4E86\u89E3\u6700\u6DF1\u5C64\u7684\u6545\u4E8B\u5167\u5BB9\uFF0C\u8207\u8A2D\u8A08\u8005\u60F3\u50B3\u9054\u7684\u610F\u5883\u3002 \u904A\u6232\u4ECB\u7D39 Escape Game",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-006",
    name: "\u65B0\u5E74\u63A5\u62DB\u4E86",
    venue_name: "EnterSpace \u5BC6\u5BA4\u9003\u812B",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71\uFF0F\u5927\u76F4",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u201310",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 2,
    styles: [
      "\u7BC0\u6176\u4E92\u52D5",
      "\u591A\u4EBA\u540C\u6A02"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D",
      "\u719F\u6089\u5BC6\u5BA4\u73A9\u6CD5\u7684\u73A9\u5BB6\u53EF\u80FD\u8F03\u5FEB\u4E0A\u624B"
    ],
    booking_url: "https://www.enterspace.tw/",
    source_urls: [
      "https://www.enterspace.tw/",
      "https://www.instagram.com/reel/DCrFD2-TV8y/"
    ],
    google_place_id: "ChIJUx5wqQ-sQjQRCFs-DKqgcJ0",
    google_review_count: 5831,
    google_rating_checked_at: "2026-08-19T06:53:32.932Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "104\u53F0\u7063\u81FA\u5317\u5E02\u4E2D\u5C71\u5340\u6C38\u5B89\u91CC\u660E\u6C34\u8DEF581\u5DF715\u865FB1",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u65B0\u5E74\u63A5\u62DB\u4E86\u300B\u4EE5\u5718\u968A\u5408\u4F5C\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u904A\u6232\u6642\u9593\u8207\u4EBA\u6578\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74 1 \u6708"
  },
  {
    id: "popular-007",
    name: "\u7570\u5F62\u8986\u6C92",
    venue_name: "Mystoto Escape Games",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u82D3\u96C5\u5340",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 4,
    styles: [
      "\u79D1\u5E7B\u5192\u96AA",
      "\u6A5F\u95DC\u64CD\u4F5C"
    ],
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.mystotoescape.com/",
    source_urls: [
      "https://www.mystotoescape.com/"
    ],
    google_place_id: "ChIJ9YUmC2gDbjQR52vZK-6epNc",
    google_review_count: 9783,
    google_rating_checked_at: "2026-08-19T06:53:51.651Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "80245\u53F0\u7063\u9AD8\u96C4\u5E02\u82D3\u96C5\u5340\u6587\u6771\u91CC\u4E2D\u83EF\u56DB\u8DEF2\u865F\u5730\u4E0B\u4E00\u6A13(B1F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7570\u5F62\u8986\u6C92\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-008",
    name: "\u5B30\u9B42\u5687\u6C34\u9053",
    venue_name: "Mystoto Escape Games",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u82D3\u96C5\u5340",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 5,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u5834\u666F\u63A2\u7D22"
    ],
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u5834\u666F\u7D30\u7BC0\u503C\u5F97\u7559\u610F"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.mystotoescape.com/",
    source_urls: [
      "https://www.mystotoescape.com/"
    ],
    google_place_id: "ChIJ9YUmC2gDbjQR52vZK-6epNc",
    google_review_count: 9783,
    google_rating_checked_at: "2026-08-19T06:53:51.651Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "80245\u53F0\u7063\u9AD8\u96C4\u5E02\u82D3\u96C5\u5340\u6587\u6771\u91CC\u4E2D\u83EF\u56DB\u8DEF2\u865F\u5730\u4E0B\u4E00\u6A13(B1F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5B30\u9B42\u5687\u6C34\u9053\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-009",
    name: "\u596A\u9B42\u7344",
    venue_name: "Mystoto Escape Games",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u82D3\u96C5\u5340",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 4,
    styles: [
      "\u7F6A\u8207\u7F70",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.mystotoescape.com/",
    source_urls: [
      "https://www.mystotoescape.com/"
    ],
    google_place_id: "ChIJ9YUmC2gDbjQR52vZK-6epNc",
    google_review_count: 9783,
    google_rating_checked_at: "2026-08-19T06:53:51.651Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "80245\u53F0\u7063\u9AD8\u96C4\u5E02\u82D3\u96C5\u5340\u6587\u6771\u91CC\u4E2D\u83EF\u56DB\u8DEF2\u865F\u5730\u4E0B\u4E00\u6A13(B1F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u596A\u9B42\u7344\u300B\u4EE5\u5718\u968A\u5408\u4F5C\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u904A\u6232\u6642\u9593\u8207\u4EBA\u6578\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://www.mystotoescape.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u7387\u7684\u5718\u5EFA\u9996\u9078\uFF01 \u900F\u904E Mystoto Escape Games \u7CBE\u5FC3\u8A2D\u8A08\u7684\u5BC6\u5BA4\u8B0E\u984C\uFF0C\u70BA\u60A8\u7684\u4F01\u696D\u5718\u968A\u6216\u5B78\u6821\u7D44\u7E54\u5E36\u4F86\u5145\u6EFF\u9A5A\u559C\u7684\u5718\u5EB7\u6D3B\u52D5\uFF0C\u958B\u5275\u7121\u9650\u53EF\u80FD\u3002\u651C\u624B\u5408\u4F5C\uFF0C\u8B93\u60A8\u7684\u5718\u968A\u5C55\u73FE\u975E\u51E1\u5408\u4F5C\u529B\uFF01 \u7ACB\u5373\u9810\u7D04 \u4F01\u696D\u5C08\u5340 \u89C0\u8CDE\u5F71\u7247 2 / 3 \u5168\u65B0\u5BC6\u5BA4\u4E3B\u984C \u596A\u9B42\u7344\uFF0C\u5373\u523B\u958B\u7210 \u4F60\u89BA\u5F97\u4F60\u81EA\u5DF1\u6709\u7F6A\u55CE\uFF1F \u4F60\uFF0C\u662F\u600E\u9EBC\u770B\u5F85\u7F6A\u8207\u7F70\u5462\uFF1F\u56E0\u70BA\u6127\u759A\u800C\u5F62\u6210\u7684\u67B7\u9396\uFF0C\u4E0D\u65B7\u627C\u4F4F\u4F60\u7684\u751F\u547D\u3002 \u4F86\u5427\uFF0C\u7D66\u81EA\u5DF1\u4E00\u500B\u91CD\u65B0\u9078\u64C7\u7684\u6A5F\u6703\u3002 \u7ACB\u5373\u9810\u7D04 \u5148\u7779\u70BA\u5FEB \u9810\u544A\u5F71\u7247 3 / 3 \u5168\u53F0\u73A9\u5BB6\u4E94\u661F\u597D\u8A55\u80AF\u5B9A 5.0 9,347 \u5247 Google \u8A55\u8AD6 \u96E3\u4EE5\u5FD8\u61F7\u7684\u5BC6\u5BA4\u9003\u812B\u65C5\u7A0B \u524D\u6240\u672A\u6709\u7684\u6C89\u6D78\u5F0F\u5BE6\u5883\u5192\u96AA Mystoto Escape Games \u5BC6\u5BA4\u9003\u812B\u70BA\u53F0\u7063\u6975\u5177\u7368\u7279\u6027\u7684\u5BC6\u5BA4\u9003\u812B\u904A\u6232\u5275\u9020\u8005\u3002 \u904B\u7528\u9AD8\u79D1\u6280\u6253\u9020\u6A5F\u95DC\u578B\u5BC6\u5BA4\u4E3B\u984C\uFF0C\u63A1\u7528\u9AD8\u5EA6\u4E92\u52D5\u7684\u904A\u6232\u5143\u7D20\uFF0C\u8DF3\u812B",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-010",
    name: "\u6211\u5011\u7684\u79D8\u5BC6",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u5317\u9928",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89\uFF0F\u677E\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taipei/",
    source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6211\u5011\u7684\u79D8\u5BC6\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u696D\u8A13\u7DF4\u3001\u6176\u751F\u806F\u8ABC\u3001\u5047\u65E5\u4F11\u9592\u7684\u6700\u4F73\u9078\u64C7\u3002 Facebook-f Instagram Envelope \u5BA2\u670D\u6642\u9593\uFF1A10:00 ~ 18:00 \u806F\u7D61\u96FB\u8A71\uFF1A(02) 8787-4387 \u300A\u7B28\u86CB\u5C0F\u5929\u4F7F\u300B\u62DB\u52DF\u4E2D\uFF01\u60F3\u8981\u64C1\u6709\u4E0D\u4E00\u6A23\u7684\u6253\u5DE5\u7D93\u9A57\u55CE\uFF1F \u5BF6\u6E05\u65B0\u9928 \u6211\u5011\u7684\u79D8\u5BC6 \uFF16~\uFF18\u4EBA \u524D\u5F80\u9810\u7D04 \u4E00\u7FA4\u591A\u5E74\u4EA4\u60C5\u7684\u6B7B\u9EE8\uFF0C\u5728\u5225\u5885\u8209\u8FA6\u751F\u65E5\u6D3E\u5C0D\u3002\u51CC\u6668\u4F60\u5011\u7A81\u7136\u9A5A\u9192\uFF0C\u767C\u73FE\u5468\u906D\u7684\u4E00\u5207\u5168\u8B8A\u4E86\u6A23\u2026\u2026 \u5BF6\u6E05\u65B0\u9928 \u7AF9\u672C\u5BB6 5~\uFF16\u4EBA \u524D\u5F80\u9810\u7D04 \u4F60\u5C07\u9032\u5165\u300E\u7AF9\u672C\u5BB6\u624B\u4F5C\u8336\u300F\u98F2\u6599\u5E97\u7576\u4EE3\u73ED\u5E97\u54E1\uFF0C\u4E09\u5341\u5E74\u8001\u5E97\u7684\u547D\u904B\u5C31\u4EA4\u7D66\u4F60\u5011\u4E86~",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74 3 \u6708"
  },
  {
    id: "popular-011",
    name: "\u7AF9\u672C\u5BB6",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u5317\u9928",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89\uFF0F\u677E\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taipei/",
    source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7AF9\u672C\u5BB6\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "8:00 \u806F\u7D61\u96FB\u8A71\uFF1A(02) 8787-4387 \u300A\u7B28\u86CB\u5C0F\u5929\u4F7F\u300B\u62DB\u52DF\u4E2D\uFF01\u60F3\u8981\u64C1\u6709\u4E0D\u4E00\u6A23\u7684\u6253\u5DE5\u7D93\u9A57\u55CE\uFF1F \u5BF6\u6E05\u65B0\u9928 \u6211\u5011\u7684\u79D8\u5BC6 \uFF16~\uFF18\u4EBA \u524D\u5F80\u9810\u7D04 \u4E00\u7FA4\u591A\u5E74\u4EA4\u60C5\u7684\u6B7B\u9EE8\uFF0C\u5728\u5225\u5885\u8209\u8FA6\u751F\u65E5\u6D3E\u5C0D\u3002\u51CC\u6668\u4F60\u5011\u7A81\u7136\u9A5A\u9192\uFF0C\u767C\u73FE\u5468\u906D\u7684\u4E00\u5207\u5168\u8B8A\u4E86\u6A23\u2026\u2026 \u5BF6\u6E05\u65B0\u9928 \u7AF9\u672C\u5BB6 5~\uFF16\u4EBA \u524D\u5F80\u9810\u7D04 \u4F60\u5C07\u9032\u5165\u300E\u7AF9\u672C\u5BB6\u624B\u4F5C\u8336\u300F\u98F2\u6599\u5E97\u7576\u4EE3\u73ED\u5E97\u54E1\uFF0C\u4E09\u5341\u5E74\u8001\u5E97\u7684\u547D\u904B\u5C31\u4EA4\u7D66\u4F60\u5011\u4E86~",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2014 \u5E74 2 \u6708"
  },
  {
    id: "popular-012",
    name: "\u6DF1\u8655",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u5317\u9928",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89\uFF0F\u677E\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taipei/",
    source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6DF1\u8655\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74 8 \u6708"
  },
  {
    id: "popular-013",
    name: "\u596A\u547D\u9396\u93C8",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u5317\u9928",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89\uFF0F\u677E\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taipei/",
    source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u596A\u547D\u9396\u93C8\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2012 \u5E74 11 \u6708"
  },
  {
    id: "popular-014",
    name: "\u596A\u547D\u9396\u93C82",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u5317\u9928",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89\uFF0F\u677E\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taipei/",
    source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u596A\u547D\u9396\u93C82\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2013 \u5E74 11 \u6708"
  },
  {
    id: "popular-015",
    name: "\u985B\u5012\u4E4B\u5BA4",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u5317\u9928",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89\uFF0F\u677E\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taipei/",
    source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u985B\u5012\u4E4B\u5BA4\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2013 \u5E74 5 \u6708"
  },
  {
    id: "popular-016",
    name: "\u596A\u547D\u8A18\u61B6",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u5317\u9928",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89\uFF0F\u677E\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taipei/",
    source_urls: [
      "https://stupidparticle.com/taipei/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u596A\u547D\u8A18\u61B6\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-017",
    name: "\u6B66\u4EC1\u65B0\u6751",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6B66\u4EC1\u65B0\u6751\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-018",
    name: "\u5165\u5B78\u5F0F",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5165\u5B78\u5F0F\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-019",
    name: "\u5E73\u5B89\u6232\u9662",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5E73\u5B89\u6232\u9662\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-020",
    name: "\u5496\u6CE2\u8207\u98E2\u9913\u8FF7\u5BAE",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5496\u6CE2\u8207\u98E2\u9913\u8FF7\u5BAE\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74 12 \u6708"
  },
  {
    id: "popular-021",
    name: "\u7F85\u4F2F\u73ED\u514B",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7F85\u4F2F\u73ED\u514B\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2015 \u5E74 3 \u6708"
  },
  {
    id: "popular-022",
    name: "\u596A\u547D\u9396\u93C8",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u596A\u547D\u9396\u93C8\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2012 \u5E74 11 \u6708"
  },
  {
    id: "popular-023",
    name: "\u985B\u5012\u4E4B\u5BA4",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u985B\u5012\u4E4B\u5BA4\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2013 \u5E74 5 \u6708"
  },
  {
    id: "popular-024",
    name: "\u9B3C\u65B0\u5A18",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u9B3C\u65B0\u5A18\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2013 \u5E74 12 \u6708"
  },
  {
    id: "popular-025",
    name: "\u7AF9\u672C\u5BB6",
    venue_name: "\u7B28\u86CB\u5DE5\u4F5C\u5BA4\uFF5C\u53F0\u4E2D\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u897F\u5340",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://stupidparticle.com/taichung/",
    source_urls: [
      "https://stupidparticle.com/taichung/"
    ],
    google_place_id: "ChIJMdZKkg-sQjQRl_TEJpsw7Zw",
    google_review_count: 4617,
    google_rating_checked_at: "2026-08-19T06:53:33.277Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "105\u53F0\u7063\u53F0\u5317\u5E02\u677E\u5C71\u5340\u5B89\u5E73\u91CC\u5357\u4EAC\u4E1C\u8DEF\u4E94\u6BB5399\u865F9\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7AF9\u672C\u5BB6\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2014 \u5E74 2 \u6708"
  },
  {
    id: "popular-026",
    name: "\u566C\u5922",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u566C\u5922\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "07101822 Facebook Instagram \u25BC403\u53F0\u4E2D\u5E02\u897F\u5340\u516C\u76CA\u8DEF130\u865F3\u6A13 \u25BC\u71DF\u696D\u6642\u9593 \u5E73\u65E513:00-21:00 \u5047\u65E510:00-21:00 \u25BC\u96FB \u8A71 0928002297 Facebook Instagram \u53F0\u5317\u9928 \u566C\u5922 \u2605\u2605\u2605 2-5 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u611F\u67D3 \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u75C5\u8B8A \u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-027",
    name: "\u611F\u67D3",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u611F\u67D3\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "m \u25BC403\u53F0\u4E2D\u5E02\u897F\u5340\u516C\u76CA\u8DEF130\u865F3\u6A13 \u25BC\u71DF\u696D\u6642\u9593 \u5E73\u65E513:00-21:00 \u5047\u65E510:00-21:00 \u25BC\u96FB \u8A71 0928002297 Facebook Instagram \u53F0\u5317\u9928 \u566C\u5922 \u2605\u2605\u2605 2-5 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u611F\u67D3 \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u75C5\u8B8A \u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-028",
    name: "\u7A3B\u8377\u4E4B\u6B4C",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7A3B\u8377\u4E4B\u6B4C\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: " \u5E73\u65E513:00-21:00 \u5047\u65E510:00-21:00 \u25BC\u96FB \u8A71 0928002297 Facebook Instagram \u53F0\u5317\u9928 \u566C\u5922 \u2605\u2605\u2605 2-5 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u611F\u67D3 \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u75C5\u8B8A \u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2015 \u5E74"
  },
  {
    id: "popular-029",
    name: "\u75C5\u8B8A",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u75C5\u8B8A\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "0 \u25BC\u96FB \u8A71 0928002297 Facebook Instagram \u53F0\u5317\u9928 \u566C\u5922 \u2605\u2605\u2605 2-5 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u611F\u67D3 \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u75C5\u8B8A \u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8 \u2605\u2605\u2605\u2605 4-6 \u7D041",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-030",
    name: "\u6C38\u751F\u52AB",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6C38\u751F\u52AB\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: " Instagram \u53F0\u5317\u9928 \u566C\u5922 \u2605\u2605\u2605 2-5 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u611F\u67D3 \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u75C5\u8B8A \u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8 \u2605\u2605\u2605\u2605 4-6 \u7D04100\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5F7C\u5CB8\u82B1 \u5922\u8FD4\uFF5C\u795E\u6E21 \u2605\u2605\u2605",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-031",
    name: "\u8700\u5C71",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u8700\u5C71\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "0\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u611F\u67D3 \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u75C5\u8B8A \u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8 \u2605\u2605\u2605\u2605 4-6 \u7D04100\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5F7C\u5CB8\u82B1 \u5922\u8FD4\uFF5C\u795E\u6E21 \u2605\u2605\u2605\u2605 4-5 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u75C5\u8B8A \u2605\u2605\u2605",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-032",
    name: "\u5929\u65B9\u591C\u8B5A",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5929\u65B9\u591C\u8B5A\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u75C5\u8B8A \u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8 \u2605\u2605\u2605\u2605 4-6 \u7D04100\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5F7C\u5CB8\u82B1 \u5922\u8FD4\uFF5C\u795E\u6E21 \u2605\u2605\u2605\u2605 4-5 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u75C5\u8B8A \u2605\u2605\u2605\u2605 4-6 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 ",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-033",
    name: "\u9109\u9593\u5C0F\u76DC",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u9109\u9593\u5C0F\u76DC\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u75C5\u8B8A \u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8 \u2605\u2605\u2605\u2605 4-6 \u7D04100\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5F7C\u5CB8\u82B1 \u5922\u8FD4\uFF5C\u795E\u6E21 \u2605\u2605\u2605\u2605 4-5 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u75C5\u8B8A \u2605\u2605\u2605\u2605 4-6 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-8 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605 3",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-034",
    name: "\u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: " \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8 \u2605\u2605\u2605\u2605 4-6 \u7D04100\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5F7C\u5CB8\u82B1 \u5922\u8FD4\uFF5C\u795E\u6E21 \u2605\u2605\u2605\u2605 4-5 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u75C5\u8B8A \u2605\u2605\u2605\u2605 4-6 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-8 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605 3-6 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-035",
    name: "\u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u9928 \u8700\u5C71 \u2605\u2605\u2605\u2605 3-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5929\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8 \u2605\u2605\u2605\u2605 4-6 \u7D04100\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5F7C\u5CB8\u82B1 \u5922\u8FD4\uFF5C\u795E\u6E21 \u2605\u2605\u2605\u2605 4-5 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u75C5\u8B8A \u2605\u2605\u2605\u2605 4-6 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-8 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605 3-6 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2014 \u5E74 5 \u6708"
  },
  {
    id: "popular-036",
    name: "\u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://funlockstudio.com/",
    source_urls: [
      "https://funlockstudio.com/"
    ],
    google_place_id: "ChIJ2fG75UY9aTQRAZI9qeMj9yg",
    google_review_count: 7837,
    google_rating_checked_at: "2026-08-19T06:53:41.792Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "403\u53F0\u7063\u81FA\u4E2D\u5E02\u897F\u5340\u4E2D\u8208\u91CC\u516C\u76CA\u8DEF130\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://funlockstudio.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u65B9\u591C\u8B5A \u2605\u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u9109\u9593\u5C0F\u76DC \u2605\u2605 2-6 \u7D0460\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5E7B\u5883\u5947\u822AII\uFF1A\u6700\u7D42\u7684\u822A\u9053 \u2605\u2605\u2605 4-8 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5931\u843D\u9B54\u5883\uFF1A\u5E8F\u7AE0 \u2605\u2605 3-6 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u93AE\u9B42\u66F2\uFF1A\u8FF4\u61B6\u5B85\u90B8 \u2605\u2605\u2605\u2605 4-6 \u7D04100\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u5317\u9928 \u5F7C\u5CB8\u82B1 \u5922\u8FD4\uFF5C\u795E\u6E21 \u2605\u2605\u2605\u2605 4-5 \u7D0490\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u75C5\u8B8A \u2605\u2605\u2605\u2605 4-6 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u7A3B\u8377\u4E4B\u6B4C \u2605\u2605 2-8 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0\u4E2D\u9928 \u6C38\u751F\u52AB \u2605\u2605\u2605 3-6 \u7D0470\u5206\u9418 \u7ACB\u5373\u9810\u8A02 \u53F0",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-037",
    name: "\u5F7C\u5CB8\u82B1\uFF0D\u5922\u8FD4",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71\uFF0F\u897F\u5340",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20135",
    duration: "\u7D0490\u5206\u9418",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.funlockstudio.com/higanhana/",
    source_urls: [
      "https://www.funlockstudio.com/higanhana/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5F7C\u5CB8\u82B1\uFF0D\u5922\u8FD4\u300B\u662F\u5F7C\u5CB8\u82B1\u4E3B\u984C\u7684\u524D\u7BC7\u8DEF\u7DDA\uFF0C\u5F9E\u91CD\u8FD4\u6545\u9109\u8207\u53CD\u8986\u51FA\u73FE\u7684\u5922\u51FA\u767C\uFF0C\u9010\u6B65\u62FC\u6E4A\u8207\u53E4\u5B85\u7684\u727D\u9023\u3002",
    story_summary_provenance: "official_theme_page_based_editorial_summary",
    story_summary_source_urls: [
      "https://www.funlockstudio.com/higanhana/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5922\u8FD4\uFF0D\u524D\u7BC7\uFF1A\u4F60\u91CD\u8FD4\u6545\u9109\uFF0C\u70BA\u4E86\u62FC\u6E4A\u90A3\u4E9B\u53CD\u8986\u51FA\u73FE\u7684\u5922\u3002\u81EA\u5DF1\u8207\u9019\u68DF\u53E4\u5B85\u7684\u727D\u9023\uFF0C\u5F9E\u4F86\u90FD\u4E0D\u662F\u5076\u7136\u3002",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-038",
    name: "\u779E\u5929\u8D8A\u7344",
    venue_name: "\u6975\u9650\u5BC6\u5BA4\u9003\u812B Limitless",
    city: "\u53F0\u5317\u5E02",
    district: "\u516C\u9928\uFF0F\u4E2D\u6B63",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    booking_url: "https://limitlessescaperoom.com/",
    source_urls: [
      "https://limitlessescaperoom.com/"
    ],
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u779E\u5929\u8D8A\u7344\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://limitlessescaperoom.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u6975\u9650\u5BC6\u5BA4\u9003\u812B Limitless | Scheduling and Booking Website \u6975\u9650\u5BC6\u5BA4\u9003\u812B Limitless Escape Room \u779E\u5929\u8D8A\u7344 Prison Break \u641C\u7D22\u4EE4 \u9A5A\u609A The Warrant Thriller \u53F0\u5317\u5BC6\u5BA4\u9003\u812B Taipei Escape Room \u53F0\u5317\u597D\u73A9 Things to do in Taipei \u53F0\u7063\u5BC6\u5BA4 Things to do in Taiwan \u516C\u9928\u5BC6\u5BA4\u9003\u812B&amp;nbsp; &amp;nbsp;&amp;nbsp;Escape Room\u4E2D\u82F1\u96D9\u8A9E&amp;nbsp; &amp;nbsp;&amp;nbsp;English Frien",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-039",
    name: "\u641C\u7D22\u4EE4",
    venue_name: "\u6975\u9650\u5BC6\u5BA4\u9003\u812B Limitless",
    city: "\u53F0\u5317\u5E02",
    district: "\u516C\u9928\uFF0F\u4E2D\u6B63",
    google_rating: 4.6,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [],
    booking_url: "https://limitlessescaperoom.com/",
    source_urls: [
      "https://limitlessescaperoom.com/"
    ],
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u641C\u7D22\u4EE4\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://limitlessescaperoom.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u6975\u9650\u5BC6\u5BA4\u9003\u812B Limitless | Scheduling and Booking Website \u6975\u9650\u5BC6\u5BA4\u9003\u812B Limitless Escape Room \u779E\u5929\u8D8A\u7344 Prison Break \u641C\u7D22\u4EE4 \u9A5A\u609A The Warrant Thriller \u53F0\u5317\u5BC6\u5BA4\u9003\u812B Taipei Escape Room \u53F0\u5317\u597D\u73A9 Things to do in Taipei \u53F0\u7063\u5BC6\u5BA4 Things to do in Taiwan \u516C\u9928\u5BC6\u5BA4\u9003\u812B&amp;nbsp; &amp;nbsp;&amp;nbsp;Escape Room\u4E2D\u82F1\u96D9\u8A9E&amp;nbsp; &amp;nbsp;&amp;nbsp;English Friendly\u4E00\u865F\u51FA\u53E3\u8D70\u8DEF3\u5206\u9418&amp;",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-040",
    name: "\u6230\u9B25\u9640\u87BA",
    venue_name: "EnterSpace \u5BC6\u5BA4\u9003\u812B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u76F4",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027",
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.enterspace.tw/",
    source_urls: [
      "https://www.enterspace.tw/"
    ],
    google_place_id: "ChIJUx5wqQ-sQjQRCFs-DKqgcJ0",
    google_review_count: 5831,
    google_rating_checked_at: "2026-08-19T06:53:32.932Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "104\u53F0\u7063\u81FA\u5317\u5E02\u4E2D\u5C71\u5340\u6C38\u5B89\u91CC\u660E\u6C34\u8DEF581\u5DF715\u865FB1",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6230\u9B25\u9640\u87BA\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2013 \u5E74"
  },
  {
    id: "popular-041",
    name: "\u61B6\u91C0\uFF1A\u4EA1\u547D\u8F2A\u8FF4",
    venue_name: "EnterSpace \u5BC6\u5BA4\u9003\u812B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u76F4",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408 2 \u4EBA\u5C0F\u968A"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.enterspace.tw/",
    source_urls: [
      "https://www.enterspace.tw/"
    ],
    google_place_id: "ChIJUx5wqQ-sQjQRCFs-DKqgcJ0",
    google_review_count: 5831,
    google_rating_checked_at: "2026-08-19T06:53:32.932Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "104\u53F0\u7063\u81FA\u5317\u5E02\u4E2D\u5C71\u5340\u6C38\u5B89\u91CC\u660E\u6C34\u8DEF581\u5DF715\u865FB1",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u61B6\u91C0\uFF1A\u4EA1\u547D\u8F2A\u8FF4\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-042",
    name: "\u7D55\u547D\u65C5\u820D",
    venue_name: "Mystoto Escape Games",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u82D3\u96C5",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.mystotoescape.com/",
    source_urls: [
      "https://www.mystotoescape.com/"
    ],
    google_place_id: "ChIJ9YUmC2gDbjQR52vZK-6epNc",
    google_review_count: 9783,
    google_rating_checked_at: "2026-08-19T06:53:51.651Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "80245\u53F0\u7063\u9AD8\u96C4\u5E02\u82D3\u96C5\u5340\u6587\u6771\u91CC\u4E2D\u83EF\u56DB\u8DEF2\u865F\u5730\u4E0B\u4E00\u6A13(B1F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7D55\u547D\u65C5\u820D\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-043",
    name: "\u6CD5\u8001\u8B0E\u57CE",
    venue_name: "Mystoto Escape Games",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u82D3\u96C5",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.mystotoescape.com/",
    source_urls: [
      "https://www.mystotoescape.com/"
    ],
    google_place_id: "ChIJ9YUmC2gDbjQR52vZK-6epNc",
    google_review_count: 9783,
    google_rating_checked_at: "2026-08-19T06:53:51.651Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "80245\u53F0\u7063\u9AD8\u96C4\u5E02\u82D3\u96C5\u5340\u6587\u6771\u91CC\u4E2D\u83EF\u56DB\u8DEF2\u865F\u5730\u4E0B\u4E00\u6A13(B1F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6CD5\u8001\u8B0E\u57CE\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2013 \u5E74"
  },
  {
    id: "popular-044",
    name: "\u5669\u5922\u9996\u90E8\u66F2\uFF1A\u8A18\u61B6\u7262\u7C60",
    venue_name: "MR.Bomb \u7206\u70B8\u5148\u751F",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u4E09\u6C11\uFF0F\u9AD8\u96C4\u8ECA\u7AD9",
    google_rating: 4.5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    booking_url: "https://www.mr-bomb.com/",
    source_urls: [
      "https://www.mr-bomb.com/"
    ],
    google_place_id: "ChIJXXyDtvQEbjQRXq1xpUYVweI",
    google_review_count: 798,
    google_rating_checked_at: "2026-08-19T06:53:54.245Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "807\u53F0\u7063\u9AD8\u96C4\u5E02\u4E09\u6C11\u5340\u6E2F\u897F\u91CC\u5EFA\u570B\u4E09\u8DEF46\u5DF73\u865F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5669\u5922\u9996\u90E8\u66F2\uFF1A\u8A18\u61B6\u7262\u7C60\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-045",
    name: "\u5669\u5922\u4E8C\u90E8\u66F2\uFF1A\u6230\u6144\u7A7A\u9593",
    venue_name: "MR.Bomb \u7206\u70B8\u5148\u751F",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u4E09\u6C11\uFF0F\u9AD8\u96C4\u8ECA\u7AD9",
    google_rating: 4.5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [],
    cons: [],
    booking_url: "https://www.mr-bomb.com/",
    source_urls: [
      "https://www.mr-bomb.com/"
    ],
    google_place_id: "ChIJXXyDtvQEbjQRXq1xpUYVweI",
    google_review_count: 798,
    google_rating_checked_at: "2026-08-19T06:53:54.245Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "807\u53F0\u7063\u9AD8\u96C4\u5E02\u4E09\u6C11\u5340\u6E2F\u897F\u91CC\u5EFA\u570B\u4E09\u8DEF46\u5DF73\u865F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5669\u5922\u4E8C\u90E8\u66F2\uFF1A\u6230\u6144\u7A7A\u9593\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-046",
    name: "\u566C\u9B42\u68EE\u9748\uFF1A\u596A\u547D\u6A39\u6D77",
    venue_name: "MR.Bomb \u7206\u70B8\u5148\u751F",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u4E09\u6C11\uFF0F\u9AD8\u96C4\u8ECA\u7AD9",
    google_rating: 4.5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    booking_url: "https://www.mr-bomb.com/",
    source_urls: [
      "https://www.mr-bomb.com/"
    ],
    google_place_id: "ChIJXXyDtvQEbjQRXq1xpUYVweI",
    google_review_count: 798,
    google_rating_checked_at: "2026-08-19T06:53:54.245Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "807\u53F0\u7063\u9AD8\u96C4\u5E02\u4E09\u6C11\u5340\u6E2F\u897F\u91CC\u5EFA\u570B\u4E09\u8DEF46\u5DF73\u865F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u566C\u9B42\u68EE\u9748\uFF1A\u596A\u547D\u6A39\u6D77\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-047",
    name: "\u73A9\u5177\u7E3D\u52D5\u54E1",
    venue_name: "MR.Bomb \u7206\u70B8\u5148\u751F",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u4E09\u6C11\uFF0F\u9AD8\u96C4\u8ECA\u7AD9",
    google_rating: 4.5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [],
    booking_url: "https://www.mr-bomb.com/",
    source_urls: [
      "https://www.mr-bomb.com/"
    ],
    google_place_id: "ChIJXXyDtvQEbjQRXq1xpUYVweI",
    google_review_count: 798,
    google_rating_checked_at: "2026-08-19T06:53:54.245Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "807\u53F0\u7063\u9AD8\u96C4\u5E02\u4E09\u6C11\u5340\u6E2F\u897F\u91CC\u5EFA\u570B\u4E09\u8DEF46\u5DF73\u865F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u73A9\u5177\u7E3D\u52D5\u54E1\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2015 \u5E74"
  },
  {
    id: "popular-048",
    name: "\u8D8A\u5357\u5927\u6230",
    venue_name: "MR.Bomb \u7206\u70B8\u5148\u751F",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u4E09\u6C11\uFF0F\u9AD8\u96C4\u8ECA\u7AD9",
    google_rating: 4.5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [],
    booking_url: "https://www.mr-bomb.com/",
    source_urls: [
      "https://www.mr-bomb.com/"
    ],
    google_place_id: "ChIJXXyDtvQEbjQRXq1xpUYVweI",
    google_review_count: 798,
    google_rating_checked_at: "2026-08-19T06:53:54.245Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "807\u53F0\u7063\u9AD8\u96C4\u5E02\u4E09\u6C11\u5340\u6E2F\u897F\u91CC\u5EFA\u570B\u4E09\u8DEF46\u5DF73\u865F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u8D8A\u5357\u5927\u6230\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2013 \u5E74"
  },
  {
    id: "popular-049",
    name: "\u6301\u7891\u5929\u5175",
    venue_name: "MR.Bomb \u7206\u70B8\u5148\u751F",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u4E09\u6C11\uFF0F\u9AD8\u96C4\u8ECA\u7AD9",
    google_rating: 4.5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [],
    booking_url: "https://www.mr-bomb.com/",
    source_urls: [
      "https://www.mr-bomb.com/"
    ],
    google_place_id: "ChIJXXyDtvQEbjQRXq1xpUYVweI",
    google_review_count: 798,
    google_rating_checked_at: "2026-08-19T06:53:54.245Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "807\u53F0\u7063\u9AD8\u96C4\u5E02\u4E09\u6C11\u5340\u6E2F\u897F\u91CC\u5EFA\u570B\u4E09\u8DEF46\u5DF73\u865F",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6301\u7891\u5929\u5175\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-050",
    name: "\u838E\u58EB\u6BD4\u4E9E\u7684\u9080\u8ACB",
    venue_name: "\u795E\u4E0D\u5728\u5834\u5BE6\u5883\u904A\u6232\uFF5C\u53F0\u4E2D\u65D7\u8266\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u4E2D\u5340",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "2\u20134",
    duration: "90\u5206\u9418\uFF08\u9AD4\u9A57\uFF0B\u89E3\u8AAA\uFF09",
    horror: 1,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://taog-game.com/taichungbooking/",
    source_urls: [
      "https://taog-game.com/taichungbooking/",
      "https://taog-game.com/%e5%8f%b0%e4%b8%ad%e8%8e%8e%e5%a3%ab%e6%af%94%e4%ba%9e%e7%9a%84%e9%82%80%e8%ab%8b/"
    ],
    google_place_id: "ChIJ-5kT4ok9aTQRIT7YjCMFyJ8",
    google_review_count: 1265,
    google_rating_checked_at: "2026-08-19T06:53:42.921Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "400\u53F0\u7063\u81FA\u4E2D\u5E02\u4E2D\u5340\u5E73\u7B49\u885734\u865F",
    data_quality: "official_catalog_with_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u838E\u58EB\u6BD4\u4E9E\u7684\u9080\u8ACB\u300B\u5E36\u968A\u4F0D\u9032\u5165\u6709\u751F\u547D\u7684\u9B54\u66F8\uFF0C\u63A5\u53D7\u6587\u5B57\u8207\u6545\u4E8B\u4EA4\u7E54\u7684\u6A5F\u95DC\u6311\u6230\uFF1B\u6D3B\u52D5\u6642\u9593\u4F9D\u5B98\u65B9\u516C\u544A\u3002",
    story_summary_provenance: "official_page_topic_name_match_editorial_rewrite",
    story_summary_source_urls: [
      "https://taog-game.com/%e5%8f%b0%e4%b8%ad%e8%8e%8e%e5%a3%ab%e6%af%94%e4%ba%9e%e7%9a%84%e9%82%80%e8%ab%8b/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u516C\u958B\u8CC7\u8A0A\u6574\u7406\uFF1B\u5834\u6B21\u3001\u50F9\u683C\u8207\u6D3B\u52D5\u5167\u5BB9\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u795E\u4E0D\u5728\u5834\u767C\u73FE\uFF0C\u4E00\u672C\u7A81\u5982\u5176\u4F86\u3001\u5E74\u4EE3\u4E45\u9060\u7684\u66F8\uFF0C\u4F3C\u4E4E\u6709\u4E86\u81EA\u5DF1\u7684\u751F\u547D\u3002\u4F60\u9858\u610F\u5192\u96AA\u9032\u5230\u9B54\u66F8\uFF0C\u63A5\u53D7\u5B83\u7684\u9080\u8ACB\u55CE\uFF1F",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://taog-game.com/taichungbooking/",
      "https://taog-game.com/%e5%8f%b0%e4%b8%ad%e8%8e%8e%e5%a3%ab%e6%AF%94%e4%BA%9e%e7%9A%84%e9%82%80%e8%AB%8b/"
    ],
    release_time: "2013 \u5E74"
  },
  {
    id: "popular-051",
    name: "\u61B6\u91C0\uFF1A\u4EA1\u547D\u8F2A\u8FF4",
    venue_name: "\u795E\u4E0D\u5728\u5834\u5BE6\u5883\u904A\u6232\uFF5C\u53F0\u5357\u9928",
    city: "\u53F0\u5357\u5E02",
    district: "\u6C38\u5EB7",
    google_rating: 4.7,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://taog-game.com/booking/",
    source_urls: [
      "https://taog-game.com/booking/"
    ],
    google_place_id: "ChIJYxlgy8Z2bjQRHmAGCyWbW4Q",
    google_review_count: 1122,
    google_rating_checked_at: "2026-08-19T06:53:50.012Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "710\u53F0\u7063\u53F0\u5357\u5E02\u6C38\u5EB7\u5340\u52DD\u5229\u91CC\u4E2D\u83EF\u8DEF1-2\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u61B6\u91C0\uFF1A\u4EA1\u547D\u8F2A\u8FF4\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-052",
    name: "\u760B\u72C2\u8FFD\u6BBA",
    venue_name: "\u795E\u4E0D\u5728\u5834\u5BE6\u5883\u904A\u6232\uFF5C\u53F0\u5357\u9928",
    city: "\u53F0\u5357\u5E02",
    district: "\u6C38\u5EB7",
    google_rating: 4.7,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://taog-game.com/booking/",
    source_urls: [
      "https://taog-game.com/booking/"
    ],
    google_place_id: "ChIJYxlgy8Z2bjQRHmAGCyWbW4Q",
    google_review_count: 1122,
    google_rating_checked_at: "2026-08-19T06:53:50.012Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "710\u53F0\u7063\u53F0\u5357\u5E02\u6C38\u5EB7\u5340\u52DD\u5229\u91CC\u4E2D\u83EF\u8DEF1-2\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u760B\u72C2\u8FFD\u6BBA\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-053",
    name: "\u5F80\u751F\u9304",
    venue_name: "\u795E\u4E0D\u5728\u5834\u5BE6\u5883\u904A\u6232\uFF5C\u53F0\u5357\u9928",
    city: "\u53F0\u5357\u5E02",
    district: "\u6C38\u5EB7",
    google_rating: 4.7,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://taog-game.com/booking/",
    source_urls: [
      "https://taog-game.com/booking/"
    ],
    google_place_id: "ChIJYxlgy8Z2bjQRHmAGCyWbW4Q",
    google_review_count: 1122,
    google_rating_checked_at: "2026-08-19T06:53:50.012Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "710\u53F0\u7063\u53F0\u5357\u5E02\u6C38\u5EB7\u5340\u52DD\u5229\u91CC\u4E2D\u83EF\u8DEF1-2\u865F3\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5F80\u751F\u9304\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-054",
    name: "\u5012\u6578 60 \u5206\u9418",
    venue_name: "\u8A31\u591A\u9580\u5BC6\u5BA4\u9003\u812B\uFF5C\u5357\u90E8\u9928\u5225",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u5DE6\u71DF\uFF0F\u65B0\u5DE6\u71DF",
    google_rating: 4.5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.doorsss.com/",
    source_urls: [
      "https://www.doorsss.com/"
    ],
    google_place_id: "ChIJnbHY7It2bjQRuV5A7W2NTJg",
    google_review_count: 5605,
    google_rating_checked_at: "2026-08-19T06:53:49.672Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "700\u53F0\u7063\u81FA\u5357\u5E02\u4E2D\u897F\u5340\u57CE\u968D\u91CC\u5317\u9580\u8DEF\u4E00\u6BB5101\u865F6\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5012\u6578 60 \u5206\u9418\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2015 \u5E74"
  },
  {
    id: "popular-055",
    name: "\u8A31\u591A\u9580\u4E3B\u984C\u9078\u96C6",
    venue_name: "\u8A31\u591A\u9580\u5BC6\u5BA4\u9003\u812B\uFF5C\u5357\u90E8\u9928\u5225",
    city: "\u9AD8\u96C4\u5E02",
    district: "\u5DE6\u71DF\uFF0F\u65B0\u5DE6\u71DF",
    google_rating: 4.5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    booking_url: "https://www.doorsss.com/",
    source_urls: [
      "https://www.doorsss.com/"
    ],
    google_place_id: "ChIJnbHY7It2bjQRuV5A7W2NTJg",
    google_review_count: 5605,
    google_rating_checked_at: "2026-08-19T06:53:49.672Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "700\u53F0\u7063\u81FA\u5357\u5E02\u4E2D\u897F\u5340\u57CE\u968D\u91CC\u5317\u9580\u8DEF\u4E00\u6BB5101\u865F6\u6A13",
    data_quality: "verified_catalog",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u8A31\u591A\u9580\u4E3B\u984C\u9078\u96C6\u300B\u4EE5\u4E3B\u984C\u63A2\u7D22\u8207\u5718\u968A\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u4F9D\u4EBA\u6578\u8207\u504F\u597D\u7684\u96E3\u5EA6\u7BE9\u9078\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2012 \u5E74\uFF08\u9996\u5E97\u6210\u7ACB\uFF09"
  },
  {
    id: "popular-056",
    name: "\u5F7C\u5CB8\u82B1\uFF0D\u795E\u6E21",
    venue_name: "FUNLOCK \u653E\u6A02\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u5C71\uFF0F\u897F\u5340",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20135",
    duration: "\u7D0490\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://www.funlockstudio.com/higanhana/",
    source_urls: [
      "https://www.funlockstudio.com/higanhana/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5F7C\u5CB8\u82B1\uFF0D\u795E\u6E21\u300B\u662F\u5F7C\u5CB8\u82B1\u4E3B\u984C\u7684\u5F8C\u7BC7\u8DEF\u7DDA\uFF0C\u8FFD\u67E5\u5F7C\u5CB8\u82B1\u76DB\u958B\u7684\u539F\u56E0\u8207\u88AB\u5C01\u5B58\u7684\u6B77\u53F2\uFF0C\u8D70\u5411\u771F\u76F8\u6E90\u982D\u3002",
    story_summary_provenance: "official_theme_page_based_editorial_summary",
    story_summary_source_urls: [
      "https://www.funlockstudio.com/higanhana/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u795E\u6E21\uFF0D\u5F8C\u7BC7\uFF1A\u5F7C\u5CB8\u82B1\u70BA\u4F55\u5728\u6B64\u76DB\u958B\uFF1F\u88AB\u5C01\u5B58\u7684\u6B77\u53F2\u3001\u672A\u66FE\u5B89\u606F\u7684\u5B58\u5728\uFF0C\u975C\u975C\u7B49\u5F85\u6709\u4EBA\u8D70\u5230\u771F\u76F8\u7684\u6E90\u982D\u3002",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-057",
    name: "\u5C4D\u8B8A",
    venue_name: "Miss GAME \u5BC6\u5BA4\u9003\u812B",
    city: "\u53F0\u5317\u5E02",
    district: "\u897F\u9580\uFF0F\u5927\u76F4\uFF0F\u677E\u6C5F\u5357\u4EAC",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 5,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u771F\u4EBA\u4E92\u52D5"
    ],
    booking_url: "https://missgame.com.tw/",
    source_urls: [
      "https://missgame.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u8A2D\u6709\u771F\u4EBA\u4E92\u52D5\u5143\u7D20",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5C4D\u8B8A\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://missgame.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5408\u4F5C \u4E92\u52D5\u5F0F\u5287\u5834 \u5A92\u9AD4\u5831\u5C0E \u7BC0\u76EE\u5408\u4F5C \u5F71\u97F3\u5831\u5C0E \u6587\u5B57\u5831\u5C0E \u95DC\u65BC\u6211\u5011 \u516C\u53F8\u6982\u8FF0 \u54C1\u724C\u6545\u4E8B \u6B77\u53F2\u6CBF\u9769 \u516C\u53F8\u7D44\u7E54 More Use tab to navigate through the menu items. English \u65E5\u672C\u8A9E \u6700\u65B0\u6D88\u606F \u5C4D\u8B8A \u8352\u6751\u5B85\u90B8\uFF0C\u71ED\u706B\u5E7D\u5FAE \u6BCF\u7576\u591C\u6DF1\uFF0C\u7E3D\u6709\u7121\u8F9C\u4E4B\u4EBA\uFF0C\u83AB\u540D\u6D88\u5931\u65BC\u6751\u93AE \u50B3\u805E\uFF0C\u5B85\u88E1\u85CF\u8457\u4E0D\u8A72\u5B58\u5728\u7684\u90AA\u7269 \u4F60\u80FD\u5426\u770B\u6E05\u771F\u76F8\uFF0C\u6D3B\u8457\u96E2\u958B\uFF1F \u6D41\u4EA1\u9EEF\u9053&amp;\u5947\u8853\u5E2B \u5DF2\u65BC2026/5/3\u7D50\u675F\u71DF\u696D\uFF01 \u6CD5\u8001 \u4E00\u80A1\u795E\u79D8\u80FD\u91CF\u8B93\u63A2\u96AA\u968A\u767C\u73FE\u4E00\u5EA7\u5F9E\u672A\u88AB\u6B77\u53F2\u8A18\u8F09\u7684\u6CD5\u8001\u5893\u5BA4\uFF0C\u5404\u4F4D\u8003\u53E4\u754C\u7684\u83C1\u82F1\u53D7\u795E\u79D8\u7D44\u7E54\u9080\u8ACB\u524D\u5F80\u67E5\u63A2...\u6E05\u771F\u76F8\uFF0C\u6D3B\u8457\u96E2\u958B\uFF1F \u89C0\u843D\u9670 \u56E0\u6545\u548C\u5973\u5152\u4F69\u4F69\u5206\u9694\u5169\u5730\u7684\u7F8E\u60E0\u63A5\u5230\u4E86\u4F69\u4F69\u5931\u8E64\u7684\u6D88\u606F\uFF0C\u99AC\u4E0A\u8D95\u56DE\u592B\u5BB6\u7684\u8001\u5B85\u3002\u5C31\u5728\u90A3\u500B\u623F\u9593\u88E1\uFF0C\u7F8E\u60E0\u5F77\u5F7F\u770B\u5230\u4F69\u4F69\u7684\u8EAB\u5F71\uFF0C\u6B63\u5982\u904E\u4E16\u7684\u5A46\u5A46\u6240\u8AAA\uFF0C",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-058",
    name: "\u6CD5\u8001",
    venue_name: "Miss GAME \u5BC6\u5BA4\u9003\u812B",
    city: "\u53F0\u5317\u5E02",
    district: "\u897F\u9580\uFF0F\u5927\u76F4\uFF0F\u677E\u6C5F\u5357\u4EAC",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "70 \u5206\u9418",
    horror: 2,
    brain: 3,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://onelink.one/s/QJnL0",
    source_urls: [
      "https://missgame.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6CD5\u8001\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://missgame.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "menu items. English \u65E5\u672C\u8A9E \u6700\u65B0\u6D88\u606F \u5C4D\u8B8A \u8352\u6751\u5B85\u90B8\uFF0C\u71ED\u706B\u5E7D\u5FAE \u6BCF\u7576\u591C\u6DF1\uFF0C\u7E3D\u6709\u7121\u8F9C\u4E4B\u4EBA\uFF0C\u83AB\u540D\u6D88\u5931\u65BC\u6751\u93AE \u50B3\u805E\uFF0C\u5B85\u88E1\u85CF\u8457\u4E0D\u8A72\u5B58\u5728\u7684\u90AA\u7269 \u4F60\u80FD\u5426\u770B\u6E05\u771F\u76F8\uFF0C\u6D3B\u8457\u96E2\u958B\uFF1F \u6D41\u4EA1\u9EEF\u9053&amp;\u5947\u8853\u5E2B \u5DF2\u65BC2026/5/3\u7D50\u675F\u71DF\u696D\uFF01 \u6CD5\u8001 \u4E00\u80A1\u795E\u79D8\u80FD\u91CF\u8B93\u63A2\u96AA\u968A\u767C\u73FE\u4E00\u5EA7\u5F9E\u672A\u88AB\u6B77\u53F2\u8A18\u8F09\u7684\u6CD5\u8001\u5893\u5BA4\uFF0C\u5404\u4F4D\u8003\u53E4\u754C\u7684\u83C1\u82F1\u53D7\u795E\u79D8\u7D44\u7E54\u9080\u8ACB\u524D\u5F80\u67E5\u63A2...\u6E05\u771F\u76F8\uFF0C\u6D3B\u8457\u96E2\u958B\uFF1F \u89C0\u843D\u9670 \u56E0\u6545\u548C\u5973\u5152\u4F69\u4F69\u5206\u9694\u5169\u5730\u7684\u7F8E\u60E0\u63A5\u5230\u4E86\u4F69\u4F69\u5931\u8E64\u7684\u6D88\u606F\uFF0C\u99AC\u4E0A\u8D95\u56DE\u592B\u5BB6\u7684\u8001\u5B85\u3002\u5C31\u5728\u90A3\u500B\u623F\u9593\u88E1\uFF0C\u7F8E\u60E0\u5F77\u5F7F\u770B\u5230\u4F69\u4F69\u7684\u8EAB\u5F71\uFF0C\u6B63\u5982\u904E\u4E16\u7684\u5A46\u5A46\u6240\u8AAA\uFF0C\u5373\u4F7F\u95DC\u4E0A\u4E86\u9580\uFF0C\u4ECD\u604D\u4F3C\u807D\u898B\u4F69\u4F69\u5728\u95A3\u6A13\u8207\u597D\u53CB\u4E00\u540C\u73A9\u800D\u7684\u8072\u97F3\u3002\u300C\u89C0\u843D\u9670\u300D\u662F\u7F8E\u60E0\u7684\u6700\u5F8C\u5E0C\u671B\uFF0C\u5979\u60F3\u77E5\u9053\u5973\u5152\u7684\u4E0B\u843D\uFF0C\u89E3\u958B\u5FC3\u4E2D\u672A\u89E3\u4E4B\u8B0E\uFF1B\u5979\u9700\u8981\u53BB\u4E00\u8D9F\u300C\u9670\u9593\u300D\u3002\u7136\u800C\u7F8E\u60E0\u4E26\u4E0D\u77E5\u9053\uFF0C\u300C\u9670\u9593\u300D\u4E5F\u6B63\u7B49\u5F85\u8457\u5979",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-059",
    name: "\u89C0\u843D\u9670",
    venue_name: "Miss GAME \u5BC6\u5BA4\u9003\u812B",
    city: "\u53F0\u5317\u5E02",
    district: "\u897F\u9580\uFF0F\u5927\u76F4\uFF0F\u677E\u6C5F\u5357\u4EAC",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "80 \u5206\u9418",
    horror: 5,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u771F\u4EBA\u4E92\u52D5"
    ],
    booking_url: "https://afflink.one/s/VIlBq",
    source_urls: [
      "https://missgame.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u8A2D\u6709\u771F\u4EBA\u4E92\u52D5\u5143\u7D20",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u89C0\u843D\u9670\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://missgame.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "MissGAME | \u5BC6\u5BA4\u9003\u812B | \u53F0\u5317\u5E02 MissGAME \u5168\u53F0\u8A55\u50F9\u6700\u9AD8\u6050\u6016\u4E3B\u984C\uFF0D\u89C0\u843D\u9670\u3001\u6700\u7642\u7652\u6709\u771F\u8C93\u7D66\u5438\u7684\u5BC6\u5BA4\u9003\u812B\uFF0D\u55B5\u5883\u5922\u904A\u3002\u5169\u4EBA\u5373\u53EF\u6210\u5718\uFF0C\u897F\u9580\u5F92\u6B65\u5340\u51FA\u7AD9\u4E94\u5206\u9418\u53EF\u5230\u3002\u5927\u578B\u6A5F\u95DC+\u611F\u4EBA\u6545\u4E8B\u3002\u4F01\u696D\u5718\u9AD4\u6D3B\u52D5\u9996\u9078\uFF01 --> MissGAME | \u5BC6\u5BA4\u9003\u812B | \u53F0\u5317\u5E02 top of page HOME \u5404\u9928\u4ECB\u7D39 \u897F\u9580\u65D7\u8266\u9928 \u53F0\u5317\u677E\u6C5F\u5357\u4EAC\u9928 \u5B9C\u862D\u50B3\u85DD\u9928 \u677E\u5C71\u6587\u5275 \u53F0\u4E2D\u9928 \u5BC6\u5BA4\u9003\u812B 2 - 4 \u4EBA 5 - 6 \u4EBA 7 - 10 \u4EBA 30 - 50 \u4EBA 50 - 200 \u4EBA \u8B0E\u984C\u5305 English \u65E5\u672C\u8A9E \u4F01\u696D\u5718\u9AD4 \u9A0E\u58EB\u51FA\u4EFB\u52D9 \u9B54\u5E7B\u5348\u5BB4 ",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-060",
    name: "\u7F8E\u5922\uFF5C\u5492\u96E8",
    venue_name: "\u5922\u904A\u738B\u570B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u540C\uFF0F\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "3\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://dream94zz.com/",
    source_urls: [
      "https://dream94zz.com/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7F8E\u5922\uFF5C\u5492\u96E8\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://dream94zz.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u9810\u6E2C\uFF0C\u800C\u8B93\u4EBA\u66F4\u6DF1\u9677 [&hellip;] \u9996\u9801 - \u3010\u5922\u904A\u738B\u570B\uFF5C\u5922\u5883\u53EF\u4EE5\u6BD4\u73FE\u5BE6\u66F4\u8FF7\u4EBA\u3011\u53F0\u5317\u6C89\u6D78\u5F0F\u5287\u5834\u30FB\u5BC6\u5BA4\u9003\u812B\u30FB\u5BE6\u5883\u904A\u6232\u30FB\u5718\u9AD4\u6D3B\u52D5 \u8DF3\u81F3\u4E3B\u8981\u5167\u5BB9 \u6700\u65B0\u6D88\u606F \u95DC\u65BC\u6211\u5011 \u4E3B\u984C\u5217\u8868 \u73A9\u5076\u4E4B\u5BB6 Dolls\u2019 House \u6975\u6050\u60E1\u5922 | INSANE \u7F8E\u5922\uFF5C\u5492\u96E8 \u60E1\u5922\uFF5C\u5B89\u96C5 \u60E1\u5922 | \u7C60\u4E2D\u9CE5 \u660E\u661F\u5922 | \u5076\u50CF\u51FA\u9053 \u5075\u63A2\u5922 | \u6293\u72C2\u9996\u6620\u6703 \u4F01\u696D\u8A13\u7DF4 \u5E38\u898B\u554F\u984C \u806F\u7D61\u6211\u5011 \u7ACB\u5373\u9810\u7D04 \u6700\u65B0\u6D88\u606F \u95DC\u65BC\u6211\u5011 \u4E3B\u984C\u5217\u8868 \u73A9\u5076\u4E4B\u5BB6 Dolls\u2019 House \u6975\u6050\u60E1\u5922 | INSANE \u7F8E\u5922\uFF5C\u5492\u96E8 \u60E1\u5922\uFF5C\u5B89\u96C5 \u60E1\u5922 | \u7C60\u4E2D\u9CE5 \u660E\u661F\u5922 | \u5076\u50CF\u51FA\u9053 \u5075\u63A2\u5922 | \u6293\u72C2\u9996\u6620\u6703 \u4F01\u696D\u8A13\u7DF4 \u5E38\u898B\u554F\u984C \u806F\u7D61\u6211\u5011 \u7ACB\u5373\u9810\u7D04 \u4EBA\u751F\u4E0D\u53EA\u5B58\u5728\u65BC\u6E05\u9192\u7684\u7247\u6BB5\uFF0C \u6709\u6642\uFF0C\u6700\u771F\u5BE6\u7684\uFF0C\u662F\u90A3\u4E9B\u5982\u5922\u822C\u7684\u77AC\u9593 \u4E5F\u8A31\u8352\u8A95\u3001\u4E5F\u8A31\u5931\u5E8F\uFF0C\u4E5F\u6B63\u56E0\u7121\u6CD5\u9810\u6E2C\uFF0C",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2014 \u5E74"
  },
  {
    id: "popular-061",
    name: "\u60E1\u5922\uFF5C\u5B89\u96C5",
    venue_name: "\u5922\u904A\u738B\u570B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u540C\uFF0F\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    players: "6\u201310",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 5,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://dream94zz.com/",
    source_urls: [
      "https://dream94zz.com/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u60E1\u5922\uFF5C\u5B89\u96C5\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://dream94zz.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u66F4\u6DF1\u9677 [&hellip;] \u9996\u9801 - \u3010\u5922\u904A\u738B\u570B\uFF5C\u5922\u5883\u53EF\u4EE5\u6BD4\u73FE\u5BE6\u66F4\u8FF7\u4EBA\u3011\u53F0\u5317\u6C89\u6D78\u5F0F\u5287\u5834\u30FB\u5BC6\u5BA4\u9003\u812B\u30FB\u5BE6\u5883\u904A\u6232\u30FB\u5718\u9AD4\u6D3B\u52D5 \u8DF3\u81F3\u4E3B\u8981\u5167\u5BB9 \u6700\u65B0\u6D88\u606F \u95DC\u65BC\u6211\u5011 \u4E3B\u984C\u5217\u8868 \u73A9\u5076\u4E4B\u5BB6 Dolls\u2019 House \u6975\u6050\u60E1\u5922 | INSANE \u7F8E\u5922\uFF5C\u5492\u96E8 \u60E1\u5922\uFF5C\u5B89\u96C5 \u60E1\u5922 | \u7C60\u4E2D\u9CE5 \u660E\u661F\u5922 | \u5076\u50CF\u51FA\u9053 \u5075\u63A2\u5922 | \u6293\u72C2\u9996\u6620\u6703 \u4F01\u696D\u8A13\u7DF4 \u5E38\u898B\u554F\u984C \u806F\u7D61\u6211\u5011 \u7ACB\u5373\u9810\u7D04 \u6700\u65B0\u6D88\u606F \u95DC\u65BC\u6211\u5011 \u4E3B\u984C\u5217\u8868 \u73A9\u5076\u4E4B\u5BB6 Dolls\u2019 House \u6975\u6050\u60E1\u5922 | INSANE \u7F8E\u5922\uFF5C\u5492\u96E8 \u60E1\u5922\uFF5C\u5B89\u96C5 \u60E1\u5922 | \u7C60\u4E2D\u9CE5 \u660E\u661F\u5922 | \u5076\u50CF\u51FA\u9053 \u5075\u63A2\u5922 | \u6293\u72C2\u9996\u6620\u6703 \u4F01\u696D\u8A13\u7DF4 \u5E38\u898B\u554F\u984C \u806F\u7D61\u6211\u5011 \u7ACB\u5373\u9810\u7D04 \u4EBA\u751F\u4E0D\u53EA\u5B58\u5728\u65BC\u6E05\u9192\u7684\u7247\u6BB5\uFF0C \u6709\u6642\uFF0C\u6700\u771F\u5BE6\u7684\uFF0C\u662F\u90A3\u4E9B\u5982\u5922\u822C\u7684\u77AC\u9593 \u4E5F\u8A31\u8352\u8A95\u3001\u4E5F\u8A31\u5931\u5E8F\uFF0C\u4E5F\u6B63\u56E0\u7121\u6CD5\u9810\u6E2C\uFF0C\u800C\u8B93\u4EBA\u66F4\u6DF1\u9677",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2014 \u5E74"
  },
  {
    id: "popular-062",
    name: "\u60E1\u5922\uFF5C\u7C60\u4E2D\u9CE5",
    venue_name: "\u5922\u904A\u738B\u570B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u540C\uFF0F\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "6\u201310",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 4,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://dream94zz.com/",
    source_urls: [
      "https://dream94zz.com/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u60E1\u5922\uFF5C\u7C60\u4E2D\u9CE5\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-063",
    name: "\u5075\u63A2\u5922\uFF5C\u6293\u72C2\u9996\u6620\u6703",
    venue_name: "\u5922\u904A\u738B\u570B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u540C\uFF0F\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "10",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 4,
    styles: [
      "\u6C89\u6D78\u5F0F\u5287\u60C5",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://dream94zz.com/",
    source_urls: [
      "https://dream94zz.com/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5075\u63A2\u5922\uFF5C\u6293\u72C2\u9996\u6620\u6703\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-064",
    name: "\u660E\u661F\u5922\uFF5C\u5076\u50CF\u51FA\u9053",
    venue_name: "\u5922\u904A\u738B\u570B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u540C\uFF0F\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "6\u201310",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 3,
    styles: [
      "\u6C89\u6D78\u5F0F\u5287\u60C5",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://dream94zz.com/",
    source_urls: [
      "https://dream94zz.com/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u660E\u661F\u5922\uFF5C\u5076\u50CF\u51FA\u9053\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-065",
    name: "\u6975\u6050\u60E1\u5922\uFF5CINSANE",
    venue_name: "\u5922\u904A\u738B\u570B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u540C\uFF0F\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 5,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://dream94zz.com/",
    source_urls: [
      "https://dream94zz.com/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6975\u6050\u60E1\u5922\uFF5CINSANE\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-066",
    name: "\u73A9\u5076\u4E4B\u5BB6 Dolls\u2019 House",
    venue_name: "\u5922\u904A\u738B\u570B",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u540C\uFF0F\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "6\u20138",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 3,
    brain: 3,
    styles: [
      "\u6C89\u6D78\u5F0F\u5287\u60C5",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://dream94zz.com/",
    source_urls: [
      "https://dream94zz.com/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u73A9\u5076\u4E4B\u5BB6 Dolls\u2019 House\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://dream94zz.com/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u6642\uFF0C\u6700\u771F\u5BE6\u7684\uFF0C\u662F\u90A3\u4E9B\u5982\u5922\u822C\u7684\u77AC\u9593 \u4E5F\u8A31\u8352\u8A95\u3001\u4E5F\u8A31\u5931\u5E8F\uFF0C\u4E5F\u6B63\u56E0\u7121\u6CD5\u9810\u6E2C\uFF0C\u800C\u8B93\u4EBA\u66F4\u6DF1\u9677 [&hellip;] \u9996\u9801 - \u3010\u5922\u904A\u738B\u570B\uFF5C\u5922\u5883\u53EF\u4EE5\u6BD4\u73FE\u5BE6\u66F4\u8FF7\u4EBA\u3011\u53F0\u5317\u6C89\u6D78\u5F0F\u5287\u5834\u30FB\u5BC6\u5BA4\u9003\u812B\u30FB\u5BE6\u5883\u904A\u6232\u30FB\u5718\u9AD4\u6D3B\u52D5 \u8DF3\u81F3\u4E3B\u8981\u5167\u5BB9 \u6700\u65B0\u6D88\u606F \u95DC\u65BC\u6211\u5011 \u4E3B\u984C\u5217\u8868 \u73A9\u5076\u4E4B\u5BB6 Dolls\u2019 House \u6975\u6050\u60E1\u5922 | INSANE \u7F8E\u5922\uFF5C\u5492\u96E8 \u60E1\u5922\uFF5C\u5B89\u96C5 \u60E1\u5922 | \u7C60\u4E2D\u9CE5 \u660E\u661F\u5922 | \u5076\u50CF\u51FA\u9053 \u5075\u63A2\u5922 | \u6293\u72C2\u9996\u6620\u6703 \u4F01\u696D\u8A13\u7DF4 \u5E38\u898B\u554F\u984C \u806F\u7D61\u6211\u5011 \u7ACB\u5373\u9810\u7D04 \u6700\u65B0\u6D88\u606F \u95DC\u65BC\u6211\u5011 \u4E3B\u984C\u5217\u8868 \u73A9\u5076\u4E4B\u5BB6 Dolls\u2019 House \u6975\u6050\u60E1\u5922 | INSANE \u7F8E\u5922\uFF5C\u5492\u96E8 \u60E1\u5922\uFF5C\u5B89\u96C5 \u60E1\u5922 | \u7C60\u4E2D\u9CE5 \u660E\u661F\u5922 | \u5076\u50CF\u51FA\u9053 \u5075\u63A2\u5922 | \u6293\u72C2\u9996\u6620\u6703 \u4F01\u696D\u8A13\u7DF4 \u5E38\u898B\u554F\u984C \u806F\u7D61\u6211\u5011 \u7ACB\u5373\u9810\u7D04 \u4EBA\u751F\u4E0D\u53EA\u5B58\u5728\u65BC\u6E05\u9192\u7684\u7247\u6BB5\uFF0C \u6709\u6642\uFF0C\u6700\u771F\u5BE6\u7684\uFF0C\u662F\u90A3\u4E9B\u5982\u5922\u822C\u7684\u77AC",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-067",
    name: "\u6AFB\u82B1\u6696\u5C45",
    venue_name: "Througher \u7A7F\u8D8A\u8005\uFF5C\u897F\u9580\u6210\u90FD\u5E97",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://througher.com.tw/",
    source_urls: [
      "https://througher.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6AFB\u82B1\u6696\u5C45\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-068",
    name: "\u591C\u8490\u6A13\u975C",
    venue_name: "Througher \u7A7F\u8D8A\u8005\uFF5C\u897F\u9580\u6210\u90FD\u5E97",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://througher.com.tw/",
    source_urls: [
      "https://througher.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u591C\u8490\u6A13\u975C\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-069",
    name: "\u9189\u5F8C\u4E00\u676F",
    venue_name: "Througher \u7A7F\u8D8A\u8005\uFF5C\u897F\u9580\u6210\u90FD\u5E97",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://througher.com.tw/",
    source_urls: [
      "https://througher.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u9189\u5F8C\u4E00\u676F\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2014 \u5E74"
  },
  {
    id: "popular-070",
    name: "\u9ED1\u6697\u5012\u5F71",
    venue_name: "Througher \u7A7F\u8D8A\u8005\uFF5C\u897F\u9580\u6210\u90FD\u5E97",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://througher.com.tw/",
    source_urls: [
      "https://througher.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u9ED1\u6697\u5012\u5F71\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2014 \u5E74"
  },
  {
    id: "popular-071",
    name: "\u5B30\u8072",
    venue_name: "Througher \u7A7F\u8D8A\u8005\uFF5C\u897F\u9580\u6210\u90FD\u5E97",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://througher.com.tw/",
    source_urls: [
      "https://througher.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5B30\u8072\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-072",
    name: "\u5BCC\u5F97\u8AB0\u8CA0",
    venue_name: "Througher \u7A7F\u8D8A\u8005\uFF5C\u897F\u9580\u4E2D\u83EF\u5E97",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://througher.com.tw/",
    source_urls: [
      "https://througher.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5BCC\u5F97\u8AB0\u8CA0\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-073",
    name: "\u6AFB\u4E4B\u96EA",
    venue_name: "Througher \u7A7F\u8D8A\u8005\uFF5C\u897F\u9580\u4E2D\u83EF\u5E97",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://througher.com.tw/",
    source_urls: [
      "https://througher.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6AFB\u4E4B\u96EA\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-074",
    name: "\u7F6A\u5922\u771F\u76F8",
    venue_name: "Througher \u7A7F\u8D8A\u8005\uFF5C\u897F\u9580\u4E2D\u83EF\u5E97",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u6C89\u6D78\u5F0F\u5287\u60C5"
    ],
    booking_url: "https://througher.com.tw/",
    source_urls: [
      "https://througher.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7F6A\u5922\u771F\u76F8\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-075",
    name: "\u7B49\u4E00\u500B\u4EBA\u2027\u76DC\u5893",
    venue_name: "LoGin \u767B\u5165\u5BC6\u5BA4\u9003\u812B",
    city: "\u65B0\u5317\u5E02",
    district: "\u4E2D\u548C",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "80\u5206\u9418",
    horror: 3,
    brain: 4,
    styles: [
      "\u6C89\u6D78\u5F0F\u5287\u60C5",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://loginescape.com/landingpagegooglemap",
    source_urls: [
      "https://loginescape.com/landingpagegooglemap"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7B49\u4E00\u500B\u4EBA\u2027\u76DC\u5893\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-076",
    name: "\u9019\u500BCase\u6709\u9EDEBig",
    venue_name: "LoGin \u767B\u5165\u5BC6\u5BA4\u9003\u812B",
    city: "\u65B0\u5317\u5E02",
    district: "\u4E2D\u548C",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "80\u5206\u9418",
    horror: 1,
    brain: 4,
    styles: [
      "\u6C89\u6D78\u5F0F\u5287\u60C5",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://loginescape.com/landingpagegooglemap",
    source_urls: [
      "https://loginescape.com/landingpagegooglemap"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u9019\u500BCase\u6709\u9EDEBig\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://loginescape.com/landingpagegooglemap"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "n\u5BC6\u5BA4\u9003\u812B | 2\u4EBA\u5373\u53EF\u5305\u5834 | \u5E73\u65E5\u512A\u60E0 | \u53F0\u5317\u5BC6\u5BA4\u7CBE\u9078\u63A8\u85A6 \u5728\u53F0\u5317\u71DF\u904B\u81F3\u4ECA\u65AC\u7372\u8D85\u904E3000\u5247Google\u8A55\u8AD6\uFF0C\u6EFF\u5206\u597D\u8A55\u63A8\u85A6\uFF0C2\u4EBA\u5373\u53EF\u5305\u5834\uFF0C\u5E73\u65E5\u9810\u7D04\u4EAB\u512A\u60E0\u50F9\u683C\u3002\u5FAE\u9A5A\u609A\u5BC6\u5BA4\u9003\u812B\u300C\u7B49\u4E00\u500B\u4EBA\u76DC\u5893\u300D\uFF0C\u5927\u578B\u6A5F\u95DC\u5834\u666F\u8B93\u4F60\u8EAB\u6B77\u5176\u5883\uFF1B\u6EAB\u99A8\u61F8\u7591\u5BC6\u5BA4\u9003\u812B\u300C\u9019\u500BCase\u6709\u9EDEBig\u300D\uFF0C\u7121\u6050\u6016\u5143\u7D20\u7684\u5287\u60C5\u548C\u9053\u5177\u63D0\u4F9B\u5B8C\u5168\u6C89\u6D78\u904A\u6232\u9AD4\u9A57\uFF1B\u6C89\u6D78\u5F0F\u5BC6\u5BA4\u9003\u812B\u300C\u5229\u7DAD\u5FB7\u9152\u5427\u300D\uFF0C\u8D85\u5927\u5834\u666F\u7A7A\u9593\u52A0\u4E0A\u6F14\u54E1\u73FE\u5834\u4E92\u52D5\u5E36\u4F86\u6700\u6975\u81F4\u7684\u904A\u6232\u9AD4\u9A57\u3002 LoGin\u5BC6\u5BA4\u9003\u812B | 2\u4EBA\u5373\u53EF\u5305\u5834 | \u5E73\u65E5\u512A\u60E0 | \u53F0\u5317\u5BC6\u5BA4\u7CBE\u9078\u63A8\u85A6",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-077",
    name: "\u5229\u7DAD\u5FB7\u9152\u5427",
    venue_name: "LoGin \u767B\u5165\u5BC6\u5BA4\u9003\u812B",
    city: "\u65B0\u5317\u5E02",
    district: "\u4E2D\u548C",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "160\u5206\u9418",
    horror: 1,
    brain: 4,
    styles: [
      "\u6C89\u6D78\u5F0F\u5287\u60C5",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://loginescape.com/landingpagegooglemap",
    source_urls: [
      "https://loginescape.com/landingpagegooglemap"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5229\u7DAD\u5FB7\u9152\u5427\u300B\u4EE5\u5834\u666F\u63A2\u7D22\u8207\u6A5F\u95DC\u89E3\u8B0E\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u6BD4\u8F03\u73A9\u6CD5\u8207\u96E3\u5EA6\u7684\u5718\u968A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://loginescape.com/landingpagegooglemap"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u904E3000\u5247Google\u8A55\u8AD6\uFF0C\u6EFF\u5206\u597D\u8A55\u63A8\u85A6\uFF0C2\u4EBA\u5373\u53EF\u5305\u5834\uFF0C\u5E73\u65E5\u9810\u7D04\u4EAB\u512A\u60E0\u50F9\u683C\u3002\u5FAE\u9A5A\u609A\u5BC6\u5BA4\u9003\u812B\u300C\u7B49\u4E00\u500B\u4EBA\u76DC\u5893\u300D\uFF0C\u5927\u578B\u6A5F\u95DC\u5834\u666F\u8B93\u4F60\u8EAB\u6B77\u5176\u5883\uFF1B\u6EAB\u99A8\u61F8\u7591\u5BC6\u5BA4\u9003\u812B\u300C\u9019\u500BCase\u6709\u9EDEBig\u300D\uFF0C\u7121\u6050\u6016\u5143\u7D20\u7684\u5287\u60C5\u548C\u9053\u5177\u63D0\u4F9B\u5B8C\u5168\u6C89\u6D78\u904A\u6232\u9AD4\u9A57\uFF1B\u6C89\u6D78\u5F0F\u5BC6\u5BA4\u9003\u812B\u300C\u5229\u7DAD\u5FB7\u9152\u5427\u300D\uFF0C\u8D85\u5927\u5834\u666F\u7A7A\u9593\u52A0\u4E0A\u6F14\u54E1\u73FE\u5834\u4E92\u52D5\u5E36\u4F86\u6700\u6975\u81F4\u7684\u904A\u6232\u9AD4\u9A57\u3002 LoGin\u5BC6\u5BA4\u9003\u812B | 2\u4EBA\u5373\u53EF\u5305\u5834 | \u5E73\u65E5\u512A\u60E0 | \u53F0\u5317\u5BC6\u5BA4\u7CBE\u9078\u63A8\u85A6",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2017 \u5E74"
  },
  {
    id: "popular-078",
    name: "\u68EE\u6797\u4E4B\u5FC3",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u68EE\u6797\u4E4B\u5FC3\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://escer.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: " \u8D85\u591A\u4E3B\u984C\u4EFB\u4F60\u9078!\u8D8A\u591A\u4EBA\u8D8A\u4FBF\u5B9C! \u5FE0\u660E\u5357\u5E97\u95DC\u5361 \u6C11\u6B0A\u5E97\u95DC\u5361 \u83EF\u7F8E\u5E97\u95DC\u5361 \u7344\u9580\u795E\u793E(\u5FE0\u660E\u5357\u5E97) \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5357\u5340\u5FE0\u660E\u5357\u8DEF758\u865F4F \u96FB\u8A71\uFF1A04-22601755 &nbsp;&nbsp; \u5FE0\u660E\u5357\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-4\u4EBA\u95DC\u5361 \u68EE\u6797\u4E4B\u5FC3 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u9738\u738B 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5BE9\u5224\u8005 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u76DC\u7FA9\u6709\u9053 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5C0F\u5C0F\u93AE 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u662F\u4E0D\u662F\u52C7\u8005 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u90AA\u5492\u66F2 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5317\u5340\u6C11\u6B0A\u8DEF",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-079",
    name: "\u9738\u738B",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u9738\u738B\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://escer.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u7F8E\u5E97\u95DC\u5361 \u7344\u9580\u795E\u793E(\u5FE0\u660E\u5357\u5E97) \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5357\u5340\u5FE0\u660E\u5357\u8DEF758\u865F4F \u96FB\u8A71\uFF1A04-22601755 &nbsp;&nbsp; \u5FE0\u660E\u5357\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-4\u4EBA\u95DC\u5361 \u68EE\u6797\u4E4B\u5FC3 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u9738\u738B 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5BE9\u5224\u8005 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u76DC\u7FA9\u6709\u9053 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5C0F\u5C0F\u93AE 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u662F\u4E0D\u662F\u52C7\u8005 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u90AA\u5492\u66F2 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5317\u5340\u6C11\u6B0A\u8DEF559\u865F2F \u96FB\u8A71\uFF1A04-22030223 &nbsp;&",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-080",
    name: "\u5BE9\u5224\u8005",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20134",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5BE9\u5224\u8005\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://escer.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "58\u865F4F \u96FB\u8A71\uFF1A04-22601755 &nbsp;&nbsp; \u5FE0\u660E\u5357\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-4\u4EBA\u95DC\u5361 \u68EE\u6797\u4E4B\u5FC3 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u9738\u738B 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5BE9\u5224\u8005 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u76DC\u7FA9\u6709\u9053 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5C0F\u5C0F\u93AE 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u662F\u4E0D\u662F\u52C7\u8005 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u90AA\u5492\u66F2 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5317\u5340\u6C11\u6B0A\u8DEF559\u865F2F \u96FB\u8A71\uFF1A04-22030223 &nbsp;&nbsp; \u6C11\u6B0A\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-8\u4EBA\u95DC\u5361",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-081",
    name: "\u76DC\u7FA9\u6709\u9053",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u76DC\u7FA9\u6709\u9053\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://escer.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "sp; \u5FE0\u660E\u5357\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-4\u4EBA\u95DC\u5361 \u68EE\u6797\u4E4B\u5FC3 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u9738\u738B 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5BE9\u5224\u8005 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u76DC\u7FA9\u6709\u9053 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5C0F\u5C0F\u93AE 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u662F\u4E0D\u662F\u52C7\u8005 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u90AA\u5492\u66F2 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5317\u5340\u6C11\u6B0A\u8DEF559\u865F2F \u96FB\u8A71\uFF1A04-22030223 &nbsp;&nbsp; \u6C11\u6B0A\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-8\u4EBA\u95DC\u5361 2-6\u4EBA\u95DC\u5361(VR",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-082",
    name: "\u5C0F\u5C0F\u93AE",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20134",
    duration: "60\u5206\u9418",
    horror: 1,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5C0F\u5C0F\u93AE\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://escer.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u6797\u4E4B\u5FC3 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u9738\u738B 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5BE9\u5224\u8005 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u76DC\u7FA9\u6709\u9053 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5C0F\u5C0F\u93AE 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u662F\u4E0D\u662F\u52C7\u8005 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u90AA\u5492\u66F2 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5317\u5340\u6C11\u6B0A\u8DEF559\u865F2F \u96FB\u8A71\uFF1A04-22030223 &nbsp;&nbsp; \u6C11\u6B0A\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-8\u4EBA\u95DC\u5361 2-6\u4EBA\u95DC\u5361(VR",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-083",
    name: "\u662F\u4E0D\u662F\u52C7\u8005",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "60\u5206\u9418",
    horror: 1,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u662F\u4E0D\u662F\u52C7\u8005\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://escer.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u9738\u738B 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5BE9\u5224\u8005 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u76DC\u7FA9\u6709\u9053 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5C0F\u5C0F\u93AE 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u662F\u4E0D\u662F\u52C7\u8005 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u90AA\u5492\u66F2 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5317\u5340\u6C11\u6B0A\u8DEF559\u865F2F \u96FB\u8A71\uFF1A04-22030223 &nbsp;&nbsp; \u6C11\u6B0A\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-8\u4EBA\u95DC\u5361 2-6\u4EBA\u95DC\u5361(VR",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-084",
    name: "\u90AA\u5492\u66F2",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "60\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u90AA\u5492\u66F2\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [
      "https://escer.com.tw/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: " 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u76DC\u7FA9\u6709\u9053 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5C0F\u5C0F\u93AE 2-4\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u662F\u4E0D\u662F\u52C7\u8005 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u90AA\u5492\u66F2 4-8\u4EBA 60\u5206\u9418 300-450 \u8A73\u7D30\u4ECB\u7D39&\u9810\u7D04 \u5730\u5740\uFF1A\u53F0\u4E2D\u5E02\u5317\u5340\u6C11\u6B0A\u8DEF559\u865F2F \u96FB\u8A71\uFF1A04-22030223 &nbsp;&nbsp; \u6C11\u6B0A\u5E97\u95DC\u5361 \u5168\u90E8\u95DC\u5361 4-8\u4EBA\u95DC\u5361 2-8\u4EBA\u95DC\u5361 2-6\u4EBA\u95DC\u5361(VR",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-085",
    name: "\u8F2A\u8FF4",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 3,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u8F2A\u8FF4\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-086",
    name: "\u7A92\u611B",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20138",
    duration: "60\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u7A92\u611B\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-087",
    name: "\u8A6D\u9130\u9A5A\u602A",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "60\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u8A6D\u9130\u9A5A\u602A\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-088",
    name: "\u5F17\u745E\u514B\u6A02\u5712",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "4\u20138",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5F17\u745E\u514B\u6A02\u5712\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-089",
    name: "\u6D88\u5931\u7684\u8056\u8A95\u79AE\u7269",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "60\u5206\u9418",
    horror: 1,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6D88\u5931\u7684\u8056\u8A95\u79AE\u7269\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-090",
    name: "\u8ECA\u8AFE\u6BD4\u4E8B\u4EF6",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u8ECA\u8AFE\u6BD4\u4E8B\u4EF6\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-091",
    name: "\u611B\u9E97\u7D72\u4ED9\u5883",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "60\u5206\u9418",
    horror: 1,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u611B\u9E97\u7D72\u4ED9\u5883\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-092",
    name: "\u8D8A\u7344\u9003\u751F",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u8D8A\u7344\u9003\u751F\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2016 \u5E74"
  },
  {
    id: "popular-093",
    name: "\u6050\u61FC\u8056\u6240",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "60\u5206\u9418",
    horror: 5,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u6050\u61FC\u8056\u6240\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-094",
    name: "\u566C\u9B42\u4E4B\u591C",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20134",
    duration: "60\u5206\u9418",
    horror: 5,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u566C\u9B42\u4E4B\u591C\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-095",
    name: "\u60E1\u9748\u8A5B\u5492",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20134",
    duration: "60\u5206\u9418",
    horror: 5,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u60E1\u9748\u8A5B\u5492\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-096",
    name: "\u53E2\u6797\u63A2\u96AA",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "60\u5206\u9418",
    horror: 1,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u53E2\u6797\u63A2\u96AA\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-097",
    name: "\u558B\u8840\u75C5\u9662",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20134",
    duration: "60\u5206\u9418",
    horror: 5,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027",
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u558B\u8840\u75C5\u9662\u300B\u4EE5\u7DCA\u5F35\u6C1B\u570D\u8207\u89E3\u8B0E\u63A2\u7D22\u70BA\u4E3B\uFF0C\u5EFA\u8B70\u5148\u78BA\u8A8D\u53EF\u63A5\u53D7\u7684\u9A5A\u609A\u7A0B\u5EA6\u8207\u904A\u6232\u8CC7\u8A0A\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-098",
    name: "\u62C6\u89E3\u6838\u5371\u6A5F",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u62C6\u89E3\u6838\u5371\u6A5F\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: null
  },
  {
    id: "popular-099",
    name: "\u8CFD\u535A\u9F90\u514B",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20136",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u8CFD\u535A\u9F90\u514B\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-100",
    name: "\u5922\u5883\u99ED\u5BA2\u2160",
    venue_name: "Escer \u7570\u4E16\u5BA2",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5357\u5340\uFF0F\u5317\u5340\uFF0F\u897F\u5C6F",
    google_rating: 5,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    players: "2\u20134",
    duration: "60\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "VR\u5BC6\u5BA4"
    ],
    booking_url: "https://escer.com.tw/",
    source_urls: [
      "https://escer.com.tw/"
    ],
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u65B0\u624B\u53EF\u80FD\u9700\u8981\u8F03\u591A\u63D0\u793A"
    ],
    data_quality: "official_theme_page_plus_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5922\u5883\u99ED\u5BA2\u2160\u300B\u70BA VR \u5BC6\u5BA4\u9AD4\u9A57\uFF0C\u8457\u91CD\u865B\u64EC\u5834\u666F\u63A2\u7D22\u8207\u5408\u4F5C\u89E3\u8B0E\uFF1B\u8A2D\u5099\u8207\u5834\u6B21\u4F9D\u5E97\u5BB6\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_source_urls: [],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "\u6A19\u7C64\u50C5\u4F5C\u70BA\u5C0E\u89BD\u63D0\u793A\uFF0C\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-101",
    name: "\u51A5\u5A5A",
    venue_name: "\u982D\u766E\u5275\u610F\u904A\u6232\uFF08\u897F\u9580\u5E97\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 4.9,
    google_place_id: "ChIJSWDdP9upQjQRZmUFYUr8ZLU",
    google_review_count: 604,
    google_rating_checked_at: "2026-08-19T06:53:37.336Z",
    google_address_verified: "10847\u53F0\u7063\u81FA\u5317\u5E02\u842C\u83EF\u5340\u65B0\u8D77\u91CC\u9577\u6C99\u8857\u4E8C\u6BB5128\u865F3F/4F",
    booking_url: "https://onelink.one/s/ypaD6",
    source_urls: [
      "https://hddcncreatives.wixsite.com/hddcngames"
    ],
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    styles: [],
    players: "1\u20134",
    duration: "60 \u5206\u9418\uFF08\u542B\u8B1B\u89E3\uFF09",
    horror: 4,
    brain: 3,
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: "\u300A\u51A5\u5A5A\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://hddcncreatives.wixsite.com/hddcngames"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://hddcncreatives.wixsite.com/hddcngames"
    ],
    release_time: "2022 \u5E74"
  },
  {
    id: "popular-102",
    name: "\u9EC3\u9053\u8FFD\u5F12",
    venue_name: "\u982D\u766E\u5275\u610F\u904A\u6232\uFF08\u897F\u9580\u5E97\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 4.9,
    google_place_id: "ChIJSWDdP9upQjQRZmUFYUr8ZLU",
    google_review_count: 604,
    google_rating_checked_at: "2026-08-19T06:53:37.336Z",
    google_address_verified: "10847\u53F0\u7063\u81FA\u5317\u5E02\u842C\u83EF\u5340\u65B0\u8D77\u91CC\u9577\u6C99\u8857\u4E8C\u6BB5128\u865F3F/4F",
    booking_url: "https://linkgo.one/s/QPdMA",
    source_urls: [
      "https://hddcncreatives.wixsite.com/hddcngames"
    ],
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [],
    styles: [],
    players: "4\u201310",
    duration: "120 \u5206\u9418\uFF08\u542B\u8B1B\u89E3\uFF09",
    horror: 2,
    brain: 4,
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: "\u300A\u9EC3\u9053\u8FFD\u5F12\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://hddcncreatives.wixsite.com/hddcngames"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://hddcncreatives.wixsite.com/hddcngames"
    ],
    release_time: null
  },
  {
    id: "popular-103",
    name: "\u661F\u9748",
    venue_name: "LOST Taiwan\uFF08\u53F0\u5317\u5FE0\u5B5D\u5E97\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89",
    google_rating: null,
    google_place_id: null,
    google_review_count: null,
    google_rating_checked_at: null,
    google_address_verified: "\u53F0\u5317\u5E02\u5927\u5B89\u5340\u5FE0\u5B5D\u6771\u8DEF4\u6BB5169\u865F5\u6A13",
    booking_url: "https://linkgo.one/s/5G1eg",
    source_urls: [
      "https://losttw.com/"
    ],
    rating_scope: "\u672A\u9010\u5E97\u6838\u5C0D\uFF1B\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u9069\u5408\u559C\u611B\u6A5F\u95DC\u89E3\u8B0E\u7684\u73A9\u5BB6",
      "\u8B0E\u984C\u8207\u661F\u5EA7\u5143\u7D20\u7D50\u5408"
    ],
    cons: [
      "\u90E8\u5206\u8B0E\u984C\u8F03\u5177\u6311\u6230\u6027"
    ],
    styles: [],
    players: "2\u20136",
    duration: "60 \u5206\u9418",
    horror: 1,
    brain: 4,
    google_rating_scope: "\u672A\u9010\u5E97\u6838\u5C0D\uFF1B\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    data_quality: "user_requested_catalog_addition_official_branch_reference",
    story_summary: "\u300A\u661F\u9748\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://losttw.com/"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://losttw.com/rooms/%E6%98%9F%E9%9D%88-tetrabiblos/",
      "https://roger5050.pixnet.net/blog/posts/15282244096"
    ],
    release_time: null
  },
  {
    id: "popular-104",
    name: "\u6240\u7F85\u9580\u4E4B\u9470",
    venue_name: "LOST Taiwan\uFF08\u53F0\u5317\u5FE0\u5B5D\u5E97\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89",
    google_rating: null,
    google_place_id: null,
    google_review_count: null,
    google_rating_checked_at: null,
    google_address_verified: "\u53F0\u5317\u5E02\u5927\u5B89\u5340\u5FE0\u5B5D\u6771\u8DEF4\u6BB5169\u865F5\u6A13",
    booking_url: "https://onelink.one/s/kmjvr",
    source_urls: [
      "https://losttw.com/"
    ],
    rating_scope: "\u672A\u9010\u5E97\u6838\u5C0D\uFF1B\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027",
      "\u6A5F\u95DC\u64CD\u4F5C\u6BD4\u91CD\u8F03\u9AD8"
    ],
    cons: [],
    styles: [],
    players: "2\u20136",
    duration: "60 \u5206\u9418",
    horror: 2,
    brain: 4,
    google_rating_scope: "\u672A\u9010\u5E97\u6838\u5C0D\uFF1B\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    data_quality: "user_requested_catalog_addition_official_branch_reference",
    story_summary: "\u300A\u6240\u7F85\u9580\u4E4B\u9470\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://losttw.com/"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://losttw.com/rooms/%E6%89%80%E7%BE%85%E9%96%80%E4%B9%8B%E9%91%B0-key-of-solomon/",
      "https://roger5050.pixnet.net/blog/posts/15282415624"
    ],
    release_time: "2018 \u5E74"
  },
  {
    id: "popular-105",
    name: "\u55B5\u5883\u5922\u904A",
    venue_name: "Miss GAME \u5BC6\u5BA4\u9003\u812B\uFF08\u897F\u9580\u65D7\u8266\u9928\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 4.9,
    google_place_id: "ChIJ-Skhsg6pQjQRZTgbRg7Lp5w",
    google_review_count: 10383,
    google_rating_checked_at: "2026-08-19T06:53:32.559Z",
    google_address_verified: "108\u53F0\u7063\u81FA\u5317\u5E02\u842C\u83EF\u5340\u842C\u58FD\u91CC\u6F22\u4E2D\u885724\u865F",
    booking_url: "https://afflink.one/s/OI9CU",
    source_urls: [
      "https://missgame.com.tw/"
    ],
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u5834\u5730\u5167\u6709\u8C93\u6BDB\uFF0C\u904E\u654F\u9AD4\u8CEA\u8005\u8ACB\u5BE9\u614E\u8A55\u4F30"
    ],
    styles: [],
    players: "2\u20136",
    duration: "90 \u5206\u9418",
    horror: 1,
    brain: 2,
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: "\u300A\u55B5\u5883\u5922\u904A\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://missgame.com.tw/"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://www.missgame.com.tw/meowdream"
    ],
    release_time: null
  },
  {
    id: "popular-106",
    name: "\u9003\u51FA\u5438\u8840\u53E4\u5821",
    venue_name: "Miss GAME \u5BC6\u5BA4\u9003\u812B\uFF08\u897F\u9580\u65D7\u8266\u9928\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 4.9,
    google_place_id: "ChIJ-Skhsg6pQjQRZTgbRg7Lp5w",
    google_review_count: 10383,
    google_rating_checked_at: "2026-08-19T06:53:32.559Z",
    google_address_verified: "108\u53F0\u7063\u81FA\u5317\u5E02\u842C\u83EF\u5340\u842C\u58FD\u91CC\u6F22\u4E2D\u885724\u865F",
    booking_url: "https://onelink.one/s/7leLl",
    source_urls: [
      "https://missgame.com.tw/"
    ],
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u61F8\u7591\u6545\u4E8B\u5177\u5206\u652F\u611F"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    styles: [],
    players: "2\u20136",
    duration: "60 \u5206\u9418",
    horror: 4,
    brain: 3,
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: "\u300A\u9003\u51FA\u5438\u8840\u53E4\u5821\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://missgame.com.tw/"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://www.missgame.com.tw/vampireofoldcastle",
      "https://marine0722.blog126.fc2.com/blog-entry-53.html"
    ],
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-107",
    name: "\u5373\u523B\u8D8A\u7344",
    venue_name: "Miss GAME \u5BC6\u5BA4\u9003\u812B\uFF08\u897F\u9580\u65D7\u8266\u9928\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 4.9,
    google_place_id: "ChIJ-Skhsg6pQjQRZTgbRg7Lp5w",
    google_review_count: 10383,
    google_rating_checked_at: "2026-08-19T06:53:32.559Z",
    google_address_verified: "108\u53F0\u7063\u81FA\u5317\u5E02\u842C\u83EF\u5340\u842C\u58FD\u91CC\u6F22\u4E2D\u885724\u865F",
    booking_url: "https://onelink.one/s/Y4dq6",
    source_urls: [
      "https://missgame.com.tw/"
    ],
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u77ED\u6642\u9593\u5373\u53EF\u5B8C\u6210\u9AD4\u9A57"
    ],
    cons: [
      "\u904A\u6232\u9AD4\u9A57\u6642\u9593\u8F03\u77ED"
    ],
    styles: [],
    players: "2\u20136",
    duration: "30 \u5206\u9418",
    horror: 1,
    brain: 2,
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: "\u300A\u5373\u523B\u8D8A\u7344\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://missgame.com.tw/"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://www.missgame.com.tw/prisonbreak-1"
    ],
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-108",
    name: "\u6349\u54AA\u85CF",
    venue_name: "Miss GAME \u5BC6\u5BA4\u9003\u812B\uFF08\u897F\u9580\u65D7\u8266\u9928\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u842C\u83EF",
    google_rating: 4.9,
    google_place_id: "ChIJ-Skhsg6pQjQRZTgbRg7Lp5w",
    google_review_count: 10383,
    google_rating_checked_at: "2026-08-19T06:53:32.559Z",
    google_address_verified: "108\u53F0\u7063\u81FA\u5317\u5E02\u842C\u83EF\u5340\u842C\u58FD\u91CC\u6F22\u4E2D\u885724\u865F",
    booking_url: "https://afflink.one/s/0ocGY",
    source_urls: [
      "https://missgame.com.tw/"
    ],
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u9069\u5408\u8F15\u9B06\u8D70\u8A2A\u897F\u9580\u753A",
      "\u7121\u9806\u5E8F\u3001\u7121\u8A08\u6642"
    ],
    cons: [
      "\u6236\u5916\u9032\u884C\u9700\u7559\u610F\u5929\u5019\u8207\u4EA4\u901A"
    ],
    styles: [],
    players: "1\u20134",
    duration: "120 \u5206\u9418",
    horror: 1,
    brain: 2,
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: "\u300A\u6349\u54AA\u85CF\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://missgame.com.tw/"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://missgamedemo.myboostime.app/products/nppjmzhe",
      "https://www.missgame.com.tw/stores"
    ],
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-109",
    name: "\u7344\u7F77\u4E0D\u80FD",
    venue_name: "QhAt \u5E3D\u5B50\u70E4\u5BC6\u5BA4\u5DE5\u5EE0",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89",
    google_rating: 4.9,
    google_place_id: "ChIJq-z2zmOpQjQR_sBQPQtnlVo",
    google_review_count: 1083,
    google_rating_checked_at: "2026-08-19T06:53:38.058Z",
    google_address_verified: "106\u53F0\u7063\u81FA\u5317\u5E02\u5927\u5B89\u5340\u9F8D\u5761\u91CC\u548C\u5E73\u6771\u8DEF\u4E00\u6BB5238\u865F7\u6A13",
    booking_url: "https://afflink.one/s/fWeAN",
    source_urls: [
      "https://linktr.ee/qhatex"
    ],
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u6A5F\u95DC\u4E92\u52D5\u6BD4\u91CD\u8F03\u9AD8"
    ],
    cons: [
      "\u90E8\u5206\u64CD\u4F5C\u9700\u7559\u610F\u5834\u666F\u52D5\u7DDA"
    ],
    styles: [],
    players: "2\u20136",
    duration: "80 \u5206\u9418\uFF08\u542B\u8B1B\u89E3\uFF09",
    horror: 1,
    brain: 2,
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: "\u300A\u7344\u7F77\u4E0D\u80FD\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://linktr.ee/qhatex"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://linktr.ee/qhatex",
      "https://bewithnene.tw/post-232317604/"
    ],
    release_time: "2019 \u5E74"
  },
  {
    id: "popular-110",
    name: "\u6DF1\u591C\u62C9\u9EB5\u92EA",
    venue_name: "QhAt \u5E3D\u5B50\u70E4\u5BC6\u5BA4\u5DE5\u5EE0",
    city: "\u53F0\u5317\u5E02",
    district: "\u5927\u5B89",
    google_rating: 4.9,
    google_place_id: "ChIJq-z2zmOpQjQR_sBQPQtnlVo",
    google_review_count: 1083,
    google_rating_checked_at: "2026-08-19T06:53:38.058Z",
    google_address_verified: "106\u53F0\u7063\u81FA\u5317\u5E02\u5927\u5B89\u5340\u9F8D\u5761\u91CC\u548C\u5E73\u6771\u8DEF\u4E00\u6BB5238\u865F7\u6A13",
    booking_url: "https://onelink.one/s/MIqHH",
    source_urls: [
      "https://linktr.ee/qhatex"
    ],
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u9069\u5408\u65B0\u624B\u5165\u9580",
      "\u52D5\u624B\u64CD\u4F5C\u6BD4\u91CD\u8F03\u9AD8"
    ],
    cons: [
      "\u9700\u7559\u610F\u4E92\u52D5\u6A5F\u95DC\u8207\u5834\u666F\u8B8A\u5316"
    ],
    styles: [],
    players: "2\u20136",
    duration: "80 \u5206\u9418\uFF08\u542B\u8B1B\u89E3\uFF09",
    horror: 1,
    brain: 2,
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: "\u300A\u6DF1\u591C\u62C9\u9EB5\u92EA\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://linktr.ee/qhatex"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://linktr.ee/qhatex",
      "https://bewithnene.tw/post-232317604/",
      "https://yaescape.com/nightramen/"
    ],
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-111",
    name: "\u5DF4\u8C9D\u6642\u7A7A\u5DE5\u4F5C\u5BA4",
    venue_name: "LOST Taiwan\uFF08\u53F0\u5317\u7AD9\u524D\u5E97\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u6B63",
    google_rating: null,
    google_place_id: null,
    google_review_count: null,
    google_rating_checked_at: null,
    google_address_verified: "\u53F0\u5317\u5E02\u4E2D\u6B63\u5340\u8A31\u660C\u885730\u865F7\u6A13",
    booking_url: "https://onelink.one/s/nuYjE",
    source_urls: [
      "https://losttw.com/"
    ],
    rating_scope: "\u672A\u9010\u5E97\u6838\u5C0D\uFF1B\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u6A5F\u95DC\u64CD\u4F5C\u6BD4\u91CD\u8F03\u9AD8",
      "\u9069\u5408\u65B0\u624B\u5165\u9580"
    ],
    cons: [
      "\u90E8\u5206\u908F\u8F2F\u984C\u9700\u8F03\u591A\u6642\u9593"
    ],
    styles: [],
    players: "2\u20136",
    duration: "70 \u5206\u9418\uFF08\u542B\u8B1B\u89E3\uFF09",
    horror: 1,
    brain: 2,
    google_rating_scope: "\u672A\u9010\u5E97\u6838\u5C0D\uFF1B\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    data_quality: "user_requested_catalog_addition_official_branch_reference",
    story_summary: "\u300A\u5DF4\u8C9D\u6642\u7A7A\u5DE5\u4F5C\u5BA4\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://losttw.com/"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://losttw.com/rooms/",
      "https://marine0722.blog.fc2.com/blog-entry-264.html"
    ],
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-112",
    name: "\u5FA9\u6D3B\u7BC0\u5CF6",
    venue_name: "LOST Taiwan\uFF08\u53F0\u5317\u7AD9\u524D\u5E97\uFF09",
    city: "\u53F0\u5317\u5E02",
    district: "\u4E2D\u6B63",
    google_rating: null,
    google_place_id: null,
    google_review_count: null,
    google_rating_checked_at: null,
    google_address_verified: "\u53F0\u5317\u5E02\u4E2D\u6B63\u5340\u8A31\u660C\u885730\u865F7\u6A13",
    booking_url: "https://onelink.one/s/cn6aQ",
    source_urls: [
      "https://losttw.com/"
    ],
    rating_scope: "\u672A\u9010\u5E97\u6838\u5C0D\uFF1B\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    duration_source: "\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u65E2\u6709\u4E3B\u984C\u5206\u985E\u8207\u7DE8\u8F2F\u8CC7\u6599\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: null,
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    pros: [
      "\u6A5F\u95DC\u64CD\u4F5C\u6BD4\u91CD\u8F03\u9AD8",
      "\u5834\u666F\u7D30\u7BC0\u503C\u5F97\u7559\u610F"
    ],
    cons: [
      "\u524D\u6BB5\u908F\u8F2F\u984C\u53EF\u80FD\u9700\u8981\u63D0\u793A"
    ],
    styles: [],
    players: "3\u20136",
    duration: "70 \u5206\u9418\uFF08\u542B\u8B1B\u89E3\uFF09",
    horror: 1,
    brain: 2,
    google_rating_scope: "\u672A\u9010\u5E97\u6838\u5C0D\uFF1B\u8ACB\u898B\u5B98\u65B9\u516C\u544A",
    data_quality: "user_requested_catalog_addition_official_branch_reference",
    story_summary: "\u300A\u5FA9\u6D3B\u7BC0\u5CF6\u300B\u76EE\u524D\u6536\u9304\u65BC\u4E3B\u984C\u76EE\u9304\uFF0C\u5B8C\u6574\u73A9\u6CD5\u3001\u4EBA\u6578\u8207\u5834\u6B21\u8ACB\u4EE5\u5E97\u5BB6\u5B98\u65B9\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_source_urls: [
      "https://losttw.com/"
    ],
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://losttw.com/rooms/",
      "https://marine0722.blog.fc2.com/blog-entry-284.html"
    ],
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-113",
    name: "\u5931\u843D\u7684\u9695\u77F3\u795E\u6BBF",
    venue_name: "\u795E\u4E0D\u5728\u5834\u5BE6\u5883\u904A\u6232\uFF5C\u53F0\u4E2D\u65D7\u8266\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u4E2D\u5340",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    google_place_id: "ChIJ-5kT4ok9aTQRIT7YjCMFyJ8",
    google_review_count: 1265,
    google_rating_checked_at: "2026-08-19T06:53:42.921Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "400\u53F0\u7063\u81FA\u4E2D\u5E02\u4E2D\u5340\u5E73\u7B49\u885734\u865F",
    booking_url: "https://taog-game.com/taichungbooking/",
    source_urls: [
      "https://taog-game.com/taichungbooking/"
    ],
    players: "7\u201310",
    duration: "120\u5206\u9418\uFF08\u9AD4\u9A57\uFF0B\u89E3\u8AAA\uFF09",
    horror: 1,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_catalog_with_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u5931\u843D\u7684\u9695\u77F3\u795E\u6BBF\u300B\u5E36\u968A\u4F0D\u6DF1\u5165\u53E4\u57C3\u53CA\u795E\u6BBF\u63A2\u96AA\uFF0C\u900F\u904E\u5718\u968A\u5408\u4F5C\u7834\u89E3\u6CBF\u9014\u8B0E\u984C\uFF1B\u6D3B\u52D5\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u65B9\u516C\u544A\u3002",
    story_summary_provenance: "official_page_topic_name_match_editorial_rewrite",
    story_summary_source_urls: [
      "https://taog-game.com/%E5%8F%B0%E4%B8%AD%E5%A4%B1%E8%90%BD%E7%9A%84%E9%9A%95%E7%9F%B3%E7%A5%9E%E6%AE%BF/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u516C\u958B\u8CC7\u8A0A\u6574\u7406\uFF1B\u5834\u6B21\u3001\u50F9\u683C\u8207\u6D3B\u52D5\u5167\u5BB9\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u6700\u8FD1\u5728\u6492\u54C8\u62C9\u6C99\u6F20\u767C\u751F\u4E00\u8D77\u9695\u77F3\u649E\u64CA\u4E8B\u4EF6\uFF01\u9695\u77F3\u5751\u6D1E\u4E2D\u7ADF\u51FA\u73FE\u4E00\u500B\u53E4\u57C3\u53CA\u795E\u6BBF\u5165\u53E3\u2026\u795E\u4E0D\u5728\u5834\u7684\u63A2\u96AA\u968A\uFF0C\u5C0B\u627E\u672A\u77E5\u8E0F\u4E0A\u65C5\u7A0B\u5427\uFF01",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://taog-game.com/taichungbooking/",
      "https://taog-game.com/%E5%8F%B0%E4%B8%AD%E5%A4%B1%E8%90%BD%E7%9A%84%E9%9A%95%E7%9F%B3%E7%A5%9E%E6%AE%BF/"
    ],
    release_time: null
  },
  {
    id: "popular-114",
    name: "\u91CD\u8FD4\u7CD6\u679C\u5C4B",
    venue_name: "\u795E\u4E0D\u5728\u5834\u5BE6\u5883\u904A\u6232\uFF5C\u53F0\u4E2D\u65D7\u8266\u9928",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u4E2D\u5340",
    google_rating: 4.9,
    rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08\u4EE3\u7406\u9580\u6ABB\uFF09",
    google_place_id: "ChIJ-5kT4ok9aTQRIT7YjCMFyJ8",
    google_review_count: 1265,
    google_rating_checked_at: "2026-08-19T06:53:42.921Z",
    google_rating_scope: "\u5E97\u5BB6\uFF0F\u5206\u5E97\u7D1A Google \u8A55\u50F9\uFF08Places API \u4EE3\u7406\u8CC7\u6599\uFF09",
    google_address_verified: "400\u53F0\u7063\u81FA\u4E2D\u5E02\u4E2D\u5340\u5E73\u7B49\u885734\u865F",
    booking_url: "https://taog-game.com/taichungbooking/",
    source_urls: [
      "https://taog-game.com/taichungbooking/"
    ],
    players: "2\u20134",
    duration: "90\u5206\u9418\uFF08\u9AD4\u9A57\uFF0B\u89E3\u8AAA\uFF09",
    horror: 1,
    brain: 3,
    styles: [
      "\u4E3B\u984C\u89E3\u8B0E"
    ],
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_catalog_with_venue_proxy",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    story_summary: "\u300A\u91CD\u8FD4\u7CD6\u679C\u5C4B\u300B\u5C07\u968A\u4F0D\u5E36\u56DE\u5931\u63A7\u7684\u9ED1\u6697\u7AE5\u8A71\uFF0C\u5728\u7CBE\u7DFB\u5834\u666F\u4E2D\u5C0B\u627E\u7DDA\u7D22\u4E26\u63ED\u958B\u771F\u76F8\uFF1B\u6D3B\u52D5\u6642\u9593\u4F9D\u5B98\u65B9\u516C\u544A\u3002",
    story_summary_provenance: "official_page_topic_name_match_editorial_rewrite",
    story_summary_source_urls: [
      "https://taog-game.com/%E5%8F%B0%E4%B8%AD-%E9%87%8D%E8%BF%94%E7%B3%96%E6%9E%9C%E5%B1%8B/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u516C\u958B\u8CC7\u8A0A\u6574\u7406\uFF1B\u5834\u6B21\u3001\u50F9\u683C\u8207\u6D3B\u52D5\u5167\u5BB9\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u6F22\u8CFD\u723E\u8207\u845B\u9E97\u7279\u9003\u51FA\u7CD6\u679C\u5C4B\u5F8C\uFF0C\u672C\u61C9\u904E\u4E0A\u5E73\u51E1\u7684\u751F\u6D3B\u3002\u7136\u800C\uFF0C\u845B\u9E97\u7279\u627E\u4E0A\u7AE5\u8A71\u7DAD\u8B77\u5C40\uFF0C\u8868\u793A\u6F22\u8CFD\u723E\u9677\u5165\u4E86\u8457\u9B54\u822C\u7684\u57F7\u5FF5\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u91CD\u9EDE\u8207\u904A\u73A9\u63D0\u9192\u4F9D\u5B98\u65B9\u4E3B\u984C\u9801\u53CA\u516C\u958B\u4E3B\u984C\u4ECB\u7D39\u4E2D\u7684\u904A\u6232\u5F62\u5F0F\u3001\u5834\u666F\u8207\u6D3B\u52D5\u65B9\u5F0F\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    editorial_scale_source_urls: [
      "https://taog-game.com/taichungbooking/",
      "https://taog-game.com/%E5%8F%B0%E4%B8%AD-%E9%87%8D%E8%BF%94%E7%B3%96%E6%9E%9C%E5%B1%8B/"
    ],
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-115",
    name: "\u4E09\u66F4",
    venue_name: "\u93AE\u51A5\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5927\u91CC\u5340",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "6\u20138",
    duration: "\u7D04150\u5206\u9418",
    horror: 5,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6C89\u6D78\u5F0F\u6F14\u7E79",
      "\u4E2D\u5F0F\u6050\u6016",
      "\u8FFD\u9010\u9AD4\u9A57"
    ],
    booking_url: "https://escape.bar/game/26477",
    source_urls: [
      "https://escape.bar/game/26477",
      "https://escape.bar/firm/26465",
      "https://www.instagram.com/sangeng.escaqe/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u4E09\u66F4\u300B\u4EE5\u4E2D\u5F0F\u6050\u6016\u8207\u6C89\u6D78\u5F0F\u6F14\u7E79\u6253\u9020\u5927\u578B\u8FF7\u5BAE\u9AD4\u9A57\uFF0C\u73A9\u5BB6\u5728\u9ED1\u6697\u8207\u8FFD\u9010\u58D3\u529B\u4E2D\u9010\u6B65\u5B8C\u6210\u4EFB\u52D9\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://escape.bar/game/26477",
      "https://escape.bar/firm/26465",
      "https://www.instagram.com/sangeng.escaqe/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u793E\u7FA4\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u5C07\u300A\u4E09\u66F4\u300B\u63CF\u8FF0\u70BA\u5927\u578B\u9ED1\u8FFD\u8FF7\u5BAE\u985E\u4E2D\u5F0F\u6C89\u6D78\u5F0F\u6050\u6016\u5BC6\u5BA4\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-116",
    name: "\u8A95\u751F",
    venue_name: "\u767E\u5BA4\u9054\u5BC6\u5BA4\u812B\u9003",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u5927\u91CC\u5340",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20138",
    duration: "\u7D04120\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6CF0\u5F0F\u6050\u6016",
      "\u6C89\u6D78\u5F0F\u6F14\u7E79",
      "\u8FFD\u9010\u9AD4\u9A57"
    ],
    booking_url: "https://escape.bar/game/26907",
    source_urls: [
      "https://escape.bar/game/26907",
      "https://escape.bar/firm/26898",
      "https://www.instagram.com/baishida_escape/",
      "https://baishidaescape.simplybook.asia/v2/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u8A95\u751F\u300B\u4EE5\u6CF0\u5F0F\u6050\u6016\u50B3\u8AAA\u70BA\u6838\u5FC3\uFF0C\u7D50\u5408\u6C89\u6D78\u6F14\u7E79\u8207\u8FFD\u9010\u6BB5\u843D\uFF0C\u4E26\u8B93\u968A\u4F0D\u5728\u9AD8\u58D3\u60C5\u5883\u4E2D\u5B8C\u6210\u5404\u81EA\u4EFB\u52D9\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://escape.bar/game/26907",
      "https://escape.bar/firm/26898",
      "https://www.instagram.com/baishida_escape/",
      "https://baishidaescape.simplybook.asia/v2/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u8207\u5B98\u65B9\u793E\u7FA4\u4EA4\u53C9\u63CF\u8FF0\u300A\u8A95\u751F\u300B\u70BA\u6CF0\u5F0F\u6050\u6016\u3001\u6C89\u6D78\u6F14\u7E79\u8207\u5927\u578B\u8FFD\u9010\u4E3B\u984C\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-117",
    name: "\u9B3C\u4E0D\u8A9E",
    venue_name: "\u5C71\u88CF\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u4E2D\u5E02",
    district: "\u592A\u5E73\u5340",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "3\u20136",
    duration: "\u7D04120\u2013150\u5206\u9418",
    horror: 5,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u6C89\u6D78\u5F0F\u6F14\u7E79",
      "\u9AD8\u96E3\u5EA6\u89E3\u8B0E",
      "\u55AE\u7DDA\u4EFB\u52D9"
    ],
    booking_url: "https://escape.bar/game/26864",
    source_urls: [
      "https://escape.bar/game/26864",
      "https://www.instagram.com/mountain111_escape/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u9B3C\u4E0D\u8A9E\u300B\u4EE5\u9AD8\u5BC6\u5EA6\u984C\u6D77\u8207\u6050\u6016\u6C1B\u570D\u63A8\u9032\u5287\u60C5\uFF0C\u968A\u4F0D\u9700\u8981\u5728\u55AE\u7DDA\u4EFB\u52D9\u7BC0\u594F\u4E2D\u5354\u4F5C\u62C6\u89E3\u7DDA\u7D22\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://escape.bar/game/26864",
      "https://www.instagram.com/mountain111_escape/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u8207\u5B98\u65B9\u793E\u7FA4\u78BA\u8A8D\u300A\u9B3C\u4E0D\u8A9E\u300B\u70BA\u5C71\u88CF\u5DE5\u4F5C\u5BA4\u7684\u6050\u6016\u5BC6\u5BA4\u4E3B\u984C\uFF0C\u5177\u6C89\u6D78\u6F14\u7E79\u8207\u9AD8\u58D3\u89E3\u8B0E\u7279\u8272\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2020 \u5E74"
  },
  {
    id: "popular-118",
    name: "LINA",
    venue_name: "\u6885\u6797\u7684\u9B0D\u5B50\u904A\u6232\u5DE5\u4F5C\u5BA4",
    city: "\u5B9C\u862D\u5E02",
    district: "\u4E8C\u9928\uFF5C\u6607\u5E73\u8857",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20136",
    duration: "\u7D04120\u5206\u9418",
    horror: 3,
    brain: 4,
    styles: [
      "\u6B50\u7F8E\u98A8\u683C",
      "\u5FAE\u6050\u61F8\u7591",
      "\u6C89\u6D78\u5F0F\u6F14\u7E79",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://www.yilanmerlinsbeard.com/",
    source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://tinybot.cc/beardyilan/product/lina%e4%ba%8c%e9%a4%a8/?opc=1&display=1",
      "https://bewithnene.tw/lina/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300ALINA\u300B\u662F\u6885\u6797\u4E8C\u9928\u7684\u6B50\u7F8E\u5FAE\u6050\u539F\u5275\u4E3B\u984C\uFF0C\u4EE5\u6C89\u6D78\u6F14\u7E79\u8207\u6A5F\u95DC\u63A2\u7D22\u5E36\u968A\u4F0D\u7A7F\u68AD\u591A\u91CD\u7A7A\u9593\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://tinybot.cc/beardyilan/product/lina%e4%ba%8c%e9%a4%a8/?opc=1&display=1",
      "https://bewithnene.tw/lina/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u7DB2\u7AD9\u5C07 LINA \u6A19\u793A\u70BA\u5168\u65B0\u4E3B\u984C\uFF1B\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u63D0\u5230\u5FAE\u6050\u3001NPC \u8207\u7A7F\u900F\u5F0F\u6F14\u7E79\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-119",
    name: "\u5DF7\u4ED4\u53E3",
    venue_name: "\u6885\u6797\u7684\u9B0D\u5B50\u904A\u6232\u5DE5\u4F5C\u5BA4",
    city: "\u5B9C\u862D\u5E02",
    district: "\u4E8C\u9928\uFF5C\u6607\u5E73\u8857",
    google_rating: null,
    rating_scope: "EscapeBar \u516C\u958B\u4E3B\u984C\u8A55\u50F9\u8207\u5B98\u65B9\u539F\u5275\u4E3B\u984C\u8CC7\u6599\uFF1B\u672C\u7AD9\u4E0D\u5C07\u5176\u8F49\u4F5C\u5E97\u5BB6\u8A55\u5206",
    players: "4\u20136",
    duration: "\u7D04120\u5206\u9418",
    horror: 2,
    brain: 3,
    styles: [
      "\u6C11\u570B\u61F7\u820A",
      "\u61F8\u7591\u63A8\u7406",
      "\u6C89\u6D78\u5F0F\u6F14\u7E79",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://www.yilanmerlinsbeard.com/",
    source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://beardyilan.com/alley/",
      "https://escape.bar/game/17377",
      "https://bewithnene.tw/alley-entrance/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u5DF7\u4ED4\u53E3\u300B\u4EE5\u5B9C\u862D\u8857\u666F\u8207\u6C11\u570B\u61F7\u820A\u6C1B\u570D\u5305\u88F9\u63A8\u7406\u89E3\u8B0E\uFF0C\u9069\u5408\u559C\u6B61\u5834\u666F\u7D30\u7BC0\u8207\u6545\u4E8B\u63A2\u7D22\u7684\u968A\u4F0D\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://beardyilan.com/alley/",
      "https://escape.bar/game/17377",
      "https://bewithnene.tw/alley-entrance/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u9801\u9762\u5C07\u5DF7\u4ED4\u53E3\u5217\u70BA\u4E8C\u9928\u4E3B\u984C\uFF1B\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u63CF\u8FF0\u5176\u70BA\u61F7\u820A\u98A8\u683C\u8207\u63A8\u7406\u89E3\u8B0E\u4F5C\u54C1\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-120",
    name: "\u9670\u7DE3",
    venue_name: "\u6885\u6797\u7684\u9B0D\u5B50\u904A\u6232\u5DE5\u4F5C\u5BA4",
    city: "\u5B9C\u862D\u5E02",
    district: "\u672C\u9928\uFF5C\u5EB7\u6A02\u8DEF",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20138",
    duration: "\u7D04120\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u53F0\u7063\u6C11\u4FD7",
      "\u6C89\u6D78\u5F0F\u6F14\u7E79",
      "\u89D2\u8272\u626E\u6F14"
    ],
    booking_url: "https://www.yilanmerlinsbeard.com/",
    source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://beardyilan.com/ghostmarriage/",
      "https://bewithnene.tw/yilanmerlinsbeard-ghostmarriage/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u9670\u7DE3\u300B\u4EE5\u53F0\u7063\u6C11\u4FD7\u8207\u89D2\u8272\u626E\u6F14\u71DF\u9020\u6050\u6016\u6C89\u6D78\u611F\uFF0C\u8B93\u968A\u4F0D\u5728\u6545\u4E8B\u8207\u4EFB\u52D9\u4EA4\u932F\u4E2D\u8FFD\u67E5\u9670\u5F71\u88E1\u7684\u7DDA\u7D22\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://beardyilan.com/ghostmarriage/",
      "https://bewithnene.tw/yilanmerlinsbeard-ghostmarriage/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u9670\u7DE3\u70BA\u6885\u6797\u4E3B\u984C\uFF1B\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u5C07\u5176\u63CF\u8FF0\u70BA\u6050\u6016\u3001\u6C11\u4FD7\u8207\u6C89\u6D78\u6F14\u7E79\u4F5C\u54C1\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-121",
    name: "\u82B1\u898B\u5C0F\u8DEF",
    venue_name: "\u6885\u6797\u7684\u9B0D\u5B50\u904A\u6232\u5DE5\u4F5C\u5BA4",
    city: "\u5B9C\u862D\u5E02",
    district: "\u672C\u9928\uFF5C\u5EB7\u6A02\u8DEF",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "3\u20135",
    duration: "\u7D0460\u201390\u5206\u9418",
    horror: 1,
    brain: 3,
    styles: [
      "\u65E5\u5F0F\u98A8\u683C",
      "\u65B0\u624B\u5C0F\u54C1",
      "\u89E3\u8B0E\u63A2\u7D22",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://www.yilanmerlinsbeard.com/",
    source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://beardyilan.com/flower/",
      "https://bewithnene.tw/hanamikoji/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u82B1\u898B\u5C0F\u8DEF\u300B\u4EE5\u65E5\u5F0F\u552F\u7F8E\u5834\u666F\u627F\u8F09\u7CBE\u7DFB\u5C0F\u54C1\u89E3\u8B0E\uFF0C\u9069\u5408\u60F3\u5F9E\u8F03\u8F15\u76C8\u7BC0\u594F\u958B\u59CB\u63A2\u7D22\u5B9C\u862D\u5BC6\u5BA4\u7684\u73A9\u5BB6\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://beardyilan.com/flower/",
      "https://bewithnene.tw/hanamikoji/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u82B1\u898B\u5C0F\u8DEF\u70BA\u672C\u9928\u4E3B\u984C\uFF1B\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u63CF\u8FF0\u5176\u70BA\u65E5\u5F0F\u552F\u7F8E\u5C0F\u54C1\uFF0C\u6700\u4F4E 3 \u4EBA\u53EF\u73A9\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-122",
    name: "\u8056\u528D\u9A0E\u58EB",
    venue_name: "\u6885\u6797\u7684\u9B0D\u5B50\u904A\u6232\u5DE5\u4F5C\u5BA4",
    city: "\u5B9C\u862D\u5E02",
    district: "\u672C\u9928\uFF5C\u5EB7\u6A02\u8DEF",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "6\u201310",
    duration: "\u7D0490\u5206\u9418",
    horror: 1,
    brain: 3,
    styles: [
      "\u5947\u5E7B\u5192\u96AA",
      "\u89D2\u8272\u626E\u6F14",
      "\u591A\u4EBA\u5354\u4F5C",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://www.yilanmerlinsbeard.com/",
    source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://beardyilan.com/sword/",
      "https://roger5050.pixnet.net/blog/posts/15176346795"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u8056\u528D\u9A0E\u58EB\u300B\u4EE5\u5947\u5E7B\u5192\u96AA\u8207\u591A\u4EBA\u89D2\u8272\u626E\u6F14\u4E32\u8D77\u6A5F\u95DC\u89E3\u8B0E\uFF0C\u9069\u5408\u5718\u9AD4\u4E00\u8D77\u6295\u5165\u4EFB\u52D9\u8207\u6545\u4E8B\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.yilanmerlinsbeard.com/",
      "https://beardyilan.com/sword/",
      "https://roger5050.pixnet.net/blog/posts/15176346795"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u8056\u528D\u9A0E\u58EB\u70BA\u672C\u9928\u4E3B\u984C\uFF1B\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u63CF\u8FF0\u5176\u70BA\u5947\u5E7B\u5192\u96AA\u8207\u591A\u4EBA\u5718\u9AD4\u5411\u4F5C\u54C1\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-123",
    name: "\u8352\u6751\u5C0F\u5B78",
    venue_name: "\u584A\u9676\u963F\u5DE5\u4F5C\u5BA4",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20139",
    duration: "90\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u6821\u5712\u602A\u8AC7",
      "\u9A5A\u609A\u6050\u6016",
      "NPC\u4E92\u52D5",
      "\u8FFD\u9010\u9AD4\u9A57"
    ],
    booking_url: "https://www.kuaitaoa.cc/",
    source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u8352\u6751\u5C0F\u5B78/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u8352\u6751\u5C0F\u5B78\u300B\u662F\u584A\u9676\u963F\u6843\u5712\u4E2D\u58E2\u5E97\u7684\u6821\u5712\u602A\u8AC7\u4E3B\u984C\uFF0C\u4EE5\u9A5A\u609A\u5834\u666F\u8207\u4E92\u52D5\u6F14\u51FA\u5E36\u968A\u4F0D\u627E\u51FA\u8352\u6751\u6821\u820D\u7684\u79D8\u5BC6\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u8352\u6751\u5C0F\u5B78/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u9996\u9801\u5C07\u8352\u6751\u5C0F\u5B78\u5217\u70BA\u6843\u5712\u4E2D\u58E2\u5E97\u4E3B\u984C\uFF0C\u4E26\u660E\u793A 90 \u5206\u9418\u30014\u20139 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-124",
    name: "\u898B\u9B3C\u5341\u6CD5",
    venue_name: "\u584A\u9676\u963F\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u6674\u5149\u5E97\uFF5C\u4E2D\u5C71",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20138",
    duration: "90\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u8A66\u81BD\u9AD4\u9A57",
      "\u9A5A\u609A\u6050\u6016",
      "NPC\u4E92\u52D5",
      "\u55AE\u7DDA\u4EFB\u52D9"
    ],
    booking_url: "https://www.kuaitaoa.cc/",
    source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u898B\u9B3C\u5341\u6CD5/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u898B\u9B3C\u5341\u6CD5\u300B\u662F\u584A\u9676\u963F\u6674\u5149\u5E97\u7684\u9A5A\u609A\u4E3B\u984C\uFF0C\u4EE5\u8A66\u81BD\u8207\u4E92\u52D5\u6F14\u51FA\u63A8\u9032\u4E00\u6BB5\u9AD8\u58D3\u55AE\u7DDA\u4EFB\u52D9\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u898B\u9B3C\u5341\u6CD5/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u9996\u9801\u5C07\u898B\u9B3C\u5341\u6CD5\u5217\u70BA\u53F0\u5317\u6674\u5149\u5E97\u4E3B\u984C\uFF0C\u4E26\u660E\u793A 90 \u5206\u9418\u30014\u20138 \u4EBA\uFF1B\u672C\u7B46\u4E0D\u6B78\u5165\u6843\u5712\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2021 \u5E74"
  },
  {
    id: "popular-125",
    name: "\u91AB\u6028",
    venue_name: "\u584A\u9676\u963F\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u6674\u5149\u5E97\uFF5C\u4E2D\u5C71",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20138",
    duration: "90\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "NPC\u4E92\u52D5",
      "\u8A66\u81BD\u9AD4\u9A57"
    ],
    booking_url: "https://www.kuaitaoa.cc/",
    source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u91AB\u6028/",
      "https://escape.bar/game/25435"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u91AB\u6028\u300B\u662F\u584A\u9676\u963F\u6674\u5149\u5E97\u7684\u6050\u6016\u4E3B\u984C\uFF0C\u900F\u904E\u91AB\u7642\u5834\u666F\u8207\u4E92\u52D5\u4EFB\u52D9\u63A8\u9032\u9AD8\u58D3\u89E3\u8B0E\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u91AB\u6028/",
      "https://escape.bar/game/25435"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u4E3B\u984C\u9801\u8207\u516C\u958B\u904A\u6232\u9801\u5217\u51FA\u91AB\u6028\u70BA\u6674\u5149\u5E97\u4E3B\u984C\uFF0C\u4E26\u6A19\u793A 90 \u5206\u9418\u30014\u20138 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74"
  },
  {
    id: "popular-126",
    name: "\u8A50\u5C4D",
    venue_name: "\u584A\u9676\u963F\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u6674\u5149\u5E97\uFF5C\u4E2D\u5C71",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "3\u20138",
    duration: "70\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u9A5A\u609A\u6050\u6016",
      "NPC\u4E92\u52D5",
      "\u6A5F\u95DC\u89E3\u8B0E"
    ],
    booking_url: "https://www.kuaitaoa.cc/",
    source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/product/\u8A50\u5C4D/",
      "https://escape.bar/game/27298"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u8A50\u5C4D\u300B\u4EE5\u77ED\u6642\u6BB5\u9AD8\u58D3\u6050\u6016\u8207\u4E92\u52D5\u6A5F\u95DC\u70BA\u4E3B\uFF0C\u9069\u5408\u60F3\u9AD4\u9A57\u9A5A\u609A\u5BC6\u5BA4\u7684\u968A\u4F0D\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/product/\u8A50\u5C4D/",
      "https://escape.bar/game/27298"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u4E3B\u984C\u9801\u8207\u516C\u958B\u904A\u6232\u9801\u5217\u51FA\u8A50\u5C4D\u70BA\u6674\u5149\u5E97\u4E3B\u984C\uFF0C\u4E26\u6A19\u793A 70 \u5206\u9418\u30013\u20138 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74"
  },
  {
    id: "popular-127",
    name: "\u584A\u9676\u683C\u5B50360",
    venue_name: "\u584A\u9676\u963F\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u6674\u5149\u5E97\uFF5C\u4E2D\u5C71",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 3,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u8DA3\u5473\u4E92\u52D5"
    ],
    booking_url: "https://www.kuaitaoa.cc/",
    source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u584A\u9676\u683C\u5B50360/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u584A\u9676\u683C\u5B50360\u300B\u662F\u584A\u9676\u963F\u6674\u5149\u5E97\u7684\u6A5F\u95DC\u4E92\u52D5\u578B\u4E3B\u984C\uFF0C\u5B8C\u6574\u4EBA\u6578\u8207\u5834\u6B21\u4EE5\u5B98\u65B9\u6700\u65B0\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u584A\u9676\u683C\u5B50360/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u584A\u9676\u683C\u5B50360\u70BA\u584A\u9676\u963F\u4E3B\u984C\uFF1B\u516C\u958B\u9801\u9762\u672A\u7A69\u5B9A\u63D0\u4F9B\u672C\u6279\u6240\u9700\u7684\u4EBA\u6578\u8207\u6642\u9593\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74"
  },
  {
    id: "popular-128",
    name: "\u584A\u9676\u96F7\u5C04",
    venue_name: "\u584A\u9676\u963F\u5DE5\u4F5C\u5BA4",
    city: "\u53F0\u5317\u5E02",
    district: "\u6674\u5149\u5E97\uFF5C\u4E2D\u5C71",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 3,
    styles: [
      "\u6A5F\u95DC\u89E3\u8B0E",
      "\u96F7\u5C04\u6311\u6230"
    ],
    booking_url: "https://www.kuaitaoa.cc/",
    source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u584A\u9676\u96F7\u5C04/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u584A\u9676\u96F7\u5C04\u300B\u662F\u584A\u9676\u963F\u6674\u5149\u5E97\u7684\u6A5F\u95DC\u6311\u6230\u578B\u4E3B\u984C\uFF0C\u5B8C\u6574\u4EBA\u6578\u8207\u5834\u6B21\u4EE5\u5B98\u65B9\u6700\u65B0\u516C\u544A\u70BA\u6E96\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.kuaitaoa.cc/",
      "https://www.kuaitaoa.cc/\u584A\u9676\u96F7\u5C04/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u584A\u9676\u96F7\u5C04\u70BA\u584A\u9676\u963F\u4E3B\u984C\uFF1B\u516C\u958B\u9801\u9762\u672A\u7A69\u5B9A\u63D0\u4F9B\u672C\u6279\u6240\u9700\u7684\u4EBA\u6578\u8207\u6642\u9593\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74"
  },
  {
    id: "popular-129",
    name: "\u8349\u9CF4\u6751\u602A\u8AC7",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u6843\u5712\u7AD9\u524D\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u6843\u5712\u7AD9\u524D\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20135",
    duration: "70\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u65E5\u5F0F\u6050\u6016",
      "\u65B0\u624B\u5165\u9580"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/GrassVillage"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u8349\u9CF4\u6751\u602A\u8AC7\u300B\u4EE5\u65E5\u5F0F\u6050\u6016\u8207\u6E05\u695A\u7684\u5165\u9580\u7BC0\u594F\uFF0C\u5E36\u73A9\u5BB6\u63A2\u7D22\u6843\u5712\u7AD9\u524D\u5E97\u7684\u602A\u8AC7\u5834\u666F\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/GrassVillage"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u8349\u9CF4\u6751\u602A\u8AC7\u70BA\u6843\u5712\u7AD9\u524D\u5E97\u4E3B\u984C\uFF0C70 \u5206\u9418\u30014\u20135 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74"
  },
  {
    id: "popular-130",
    name: "\u51A5\u5A5A",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u6843\u5712\u7AD9\u524D\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u6843\u5712\u7AD9\u524D\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "2\u20135",
    duration: "100\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u6C11\u4FD7\u6050\u6016",
      "\u6C89\u6D78\u6F14\u7E79"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/marry"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u51A5\u5A5A\u300B\u4EE5\u6C11\u4FD7\u7981\u5FCC\u8207\u9670\u932F\u967D\u5DEE\u7684\u5287\u60C5\u63A8\u9032\u6C89\u6D78\u5F0F\u6050\u6016\u9AD4\u9A57\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/marry"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u51A5\u5A5A\u70BA\u6843\u5712\u7AD9\u524D\u5E97\u4E3B\u984C\uFF0C100 \u5206\u9418\u30012\u20135 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74"
  },
  {
    id: "popular-131",
    name: "44\u5EF3\u901D\u4E16\u5EF3",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u6843\u5712\u7AD9\u524D\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u6843\u5712\u7AD9\u524D\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20138",
    duration: "100\u5206\u9418",
    horror: 3,
    brain: 3,
    styles: [
      "\u9663\u71DF\u5C0D\u6230",
      "\u6C89\u6D78\u6F14\u7E79"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/TheDeathofCinema"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A44\u5EF3\u901D\u4E16\u5EF3\u300B\u4EE5\u9670\u9593\u89D2\u8272\u9663\u71DF\u5C0D\u6230\u7D50\u5408\u6C89\u6D78\u6F14\u7E79\uFF0C\u8B93\u968A\u4F0D\u5728\u9663\u71DF\u76EE\u6A19\u4E2D\u5B8C\u6210\u4EFB\u52D9\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/TheDeathofCinema"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA 44 \u5EF3\u901D\u4E16\u5EF3\u70BA\u6843\u5712\u7AD9\u524D\u5E97\u4E3B\u984C\uFF0C100 \u5206\u9418\u30014\u20138 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2022 \u5E74"
  },
  {
    id: "popular-132",
    name: "\u6B9B\u6642",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u6843\u5712\u7AD9\u524D\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u6843\u5712\u7AD9\u524D\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "2\u20135",
    duration: "90\u5206\u9418",
    horror: 3,
    brain: 3,
    styles: [
      "\u5287\u60C5\u89E3\u8B0E",
      "\u6C11\u4FD7\u50B3\u8AAA"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/goodday"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u6B9B\u6642\u300B\u4EE5\u5CF0\u8FF4\u8DEF\u8F49\u7684\u5287\u60C5\u8207\u826F\u8FB0\u5409\u6642\u610F\u8C61\uFF0C\u5E36\u73A9\u5BB6\u5B8C\u6210\u4E00\u6BB5\u6843\u5712\u7AD9\u524D\u5E97\u7684\u6545\u4E8B\u89E3\u8B0E\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/goodday"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u6B9B\u6642\u70BA\u6843\u5712\u7AD9\u524D\u5E97\u4E3B\u984C\uFF0C90 \u5206\u9418\u30012\u20135 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74 5 \u6708"
  },
  {
    id: "popular-133",
    name: "\u6B9B\u6642+\u51A5\u5A5A",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u6843\u5712\u7AD9\u524D\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u6843\u5712\u7AD9\u524D\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20135",
    duration: "140\u5206\u9418",
    horror: 5,
    brain: 3,
    styles: [
      "\u9023\u5237\u9AD4\u9A57",
      "\u6050\u6016\u5287\u60C5"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/cheap"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u6B9B\u6642+\u51A5\u5A5A\u300B\u5C07\u524D\u50B3\u8207\u6B63\u50B3\u9023\u5237\uFF0C\u8B93\u73A9\u5BB6\u4E0D\u4E2D\u65B7\u5730\u9AD4\u9A57\u5B8C\u6574\u6C11\u4FD7\u6050\u6016\u6545\u4E8B\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/cheap"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u6B9B\u6642+\u51A5\u5A5A\u70BA\u6843\u5712\u7AD9\u524D\u5E97\u9023\u5237\u4E3B\u984C\uFF0C140 \u5206\u9418\u30014\u20135 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74 5 \u6708"
  },
  {
    id: "popular-134",
    name: "\u7B2C\u4E5D\u591C",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u6843\u5712\u7AD9\u524D\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u6843\u5712\u7AD9\u524D\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20136",
    duration: "110\u5206\u9418",
    horror: 4,
    brain: 4,
    styles: [
      "\u8650\u5FC3\u5287\u60C5",
      "\u9A5A\u609A\u61F8\u7591"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/nekomata"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u7B2C\u4E5D\u591C\u300B\u4EE5\u8650\u5FC3\u5287\u60C5\u8207\u61F8\u7591\u7BC0\u594F\u63A8\u9032\u6843\u5712\u7AD9\u524D\u5E97\u7684\u9A5A\u609A\u9AD4\u9A57\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/nekomata"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u7B2C\u4E5D\u591C\u70BA\u6843\u5712\u7AD9\u524D\u5E97\u4E3B\u984C\uFF0C110 \u5206\u9418\u30014\u20136 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74"
  },
  {
    id: "popular-135",
    name: "\u5C71\u4E2D\u5C0F\u5C4B\u85CF\u8EAB\u8655",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u6843\u5712\u7AD9\u524D\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u6843\u5712\u7AD9\u524D\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "3\u20136",
    duration: "100\u5206\u9418",
    horror: 3,
    brain: 4,
    styles: [
      "\u9A5A\u609A\u61F8\u7591",
      "\u65B0\u624B\u63A8\u85A6"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/hut"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u5C71\u4E2D\u5C0F\u5C4B\u85CF\u8EAB\u8655\u300B\u4EE5\u9A5A\u609A\u61F8\u7591\u8207\u8F03\u53CB\u5584\u7684\u5165\u9580\u7BC0\u594F\uFF0C\u5C55\u958B\u6843\u5712\u7AD9\u524D\u5E97\u7684\u5C71\u5C4B\u6545\u4E8B\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/hut"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u5C71\u4E2D\u5C0F\u5C4B\u85CF\u8EAB\u8655\u70BA\u6843\u5712\u7AD9\u524D\u5E97\u4E3B\u984C\uFF0C100 \u5206\u9418\u30013\u20136 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74"
  },
  {
    id: "popular-136",
    name: "\u9B31\u91D1\u9999",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u4E2D\u58E2\u4E2D\u539F\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u4E2D\u539F\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20136",
    duration: "100\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u96FB\u5F71\u5834\u666F",
      "NPC\u4E92\u52D5"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/TheTulip"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u9B31\u91D1\u9999\u300B\u4EE5\u96FB\u5F71\u5834\u666F\u8207 NPC \u4E92\u52D5\u6253\u9020\u4E2D\u58E2\u4E2D\u539F\u5E97\u7684\u6C89\u6D78\u5F0F\u6545\u4E8B\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/TheTulip"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u9B31\u91D1\u9999\u70BA\u4E2D\u58E2\u4E2D\u539F\u5E97\u4E3B\u984C\uFF0C100 \u5206\u9418\u30014\u20136 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74"
  },
  {
    id: "popular-137",
    name: "\u8CCA-\u5341\u8F09\u6625\u79CB",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u4E2D\u58E2\u4E2D\u539F\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u4E2D\u539F\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20138",
    duration: "100\u5206\u9418",
    horror: 1,
    brain: 4,
    styles: [
      "\u4E2D\u570B\u53E4\u98A8",
      "\u76DC\u8CCA\u9AD4\u9A57"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/thief10th"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u8CCA-\u5341\u8F09\u6625\u79CB\u300B\u4EE5\u4E2D\u570B\u53E4\u98A8\u8207\u76DC\u8CCA\u4EFB\u52D9\u70BA\u4E3B\u8EF8\uFF0C\u9069\u5408\u559C\u6B61\u89D2\u8272\u4EFB\u52D9\u8207\u6A5F\u95DC\u89E3\u8B0E\u7684\u5718\u968A\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/thief10th"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u8CCA-\u5341\u8F09\u6625\u79CB\u70BA\u4E2D\u58E2\u4E2D\u539F\u5E97\u4E3B\u984C\uFF0C100 \u5206\u9418\u30014\u20138 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74"
  },
  {
    id: "popular-138",
    name: "\u594E\u857E\u7CBE\u795E\u75C5\u9662",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u4E2D\u58E2\u4E2D\u539F\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u4E2D\u539F\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "3\u20136",
    duration: "90\u5206\u9418",
    horror: 4,
    brain: 3,
    styles: [
      "\u9A5A\u609A\u61F8\u7591",
      "\u65B0\u624B\u63A8\u85A6"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/hospital"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u594E\u857E\u7CBE\u795E\u75C5\u9662\u300B\u4EE5\u9A5A\u609A\u61F8\u7591\u8207\u8F03\u53CB\u5584\u7684\u5165\u9580\u7BC0\u594F\uFF0C\u5E36\u73A9\u5BB6\u63A2\u7D22\u4E2D\u58E2\u4E2D\u539F\u5E97\u7684\u91AB\u9662\u5834\u666F\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/hospital"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u594E\u857E\u7CBE\u795E\u75C5\u9662\u70BA\u4E2D\u58E2\u4E2D\u539F\u5E97\u4E3B\u984C\uFF0C90 \u5206\u9418\u30013\u20136 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74"
  },
  {
    id: "popular-139",
    name: "\u6BAD\u5C40",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u4E2D\u58E2\u4E2D\u539F\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u4E2D\u539F\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "4\u20136",
    duration: "120\u5206\u9418",
    horror: 5,
    brain: 3,
    styles: [
      "\u9999\u6E2F\u8840\u6848",
      "\u6050\u6016\u5BEB\u5BE6"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/Hongkong"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u6BAD\u5C40\u300B\u4EE5\u9999\u6E2F\u8840\u6848\u8207\u6050\u6016\u5BEB\u5BE6\u98A8\u683C\uFF0C\u63A8\u9032\u4E2D\u58E2\u4E2D\u539F\u5E97\u7684\u9AD8\u58D3\u5BC6\u5BA4\u6545\u4E8B\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/Hongkong"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u6BAD\u5C40\u70BA\u4E2D\u58E2\u4E2D\u539F\u5E97\u4E3B\u984C\uFF0C120 \u5206\u9418\u30014\u20136 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2023 \u5E74"
  },
  {
    id: "popular-140",
    name: "\u7406\u9AEE\u5E2B\u9676\u5FB7\u5361\u7279",
    venue_name: "A5 Studio \u5BE6\u5883\u5BC6\u5BA4\u9003\u812B\uFF5C\u4E2D\u58E2\u4E2D\u539F\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u4E2D\u539F\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "5\u20138",
    duration: "120\u5206\u9418",
    horror: 2,
    brain: 4,
    styles: [
      "\u611F\u4EBA\u5287\u60C5",
      "\u82F1\u570B\u5DE5\u696D\u98A8"
    ],
    booking_url: "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
    source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/barber"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u7406\u9AEE\u5E2B\u9676\u5FB7\u5361\u7279\u300B\u4EE5\u82F1\u570B\u5DE5\u696D\u98A8\u8207\u611F\u4EBA\u5287\u60C5\u5305\u88DD\u4E2D\u58E2\u4E2D\u539F\u5E97\u7684\u6545\u4E8B\u89E3\u8B0E\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.a5-studio.com.tw/\u5BC6\u5BA4\u9003\u812B\u4E3B\u984C",
      "https://booking.a5studio.com.tw/activities/barber"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "A5 \u5B98\u65B9\u4E3B\u984C\u9801\u5217\u51FA\u7406\u9AEE\u5E2B\u9676\u5FB7\u5361\u7279\u70BA\u4E2D\u58E2\u4E2D\u539F\u5E97\u4E3B\u984C\uFF0C120 \u5206\u9418\u30015\u20138 \u4EBA\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74 1 \u6708"
  },
  {
    id: "popular-141",
    name: "\u5931\u7269\u62DB\u9818",
    venue_name: "\u8B0E\u5931\u5DE5\u4F5C\u5BA4\uFF5C\u6843\u5712\u5C71\u5B50\u9802\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u5C71\u5B50\u9802\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "2\u20134",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 3,
    brain: 3,
    styles: [
      "\u6821\u5712\u61F8\u7591",
      "\u6050\u6016\u6C1B\u570D"
    ],
    booking_url: "https://www.missstudio.design/",
    source_urls: [
      "https://www.missstudio.design/",
      "https://missstudio.simplybook.asia/v2/",
      "https://escape.bar/firm/10282"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u5931\u7269\u62DB\u9818\u300B\u4EE5\u6821\u5712\u670D\u52D9\u8207\u7981\u5FCC\u7A7A\u9593\u70BA\u984C\u6750\uFF0C\u9069\u5408\u559C\u6B61\u5FAE\u6050\u61F8\u7591\u8207\u5C0F\u968A\u89E3\u8B0E\u7684\u73A9\u5BB6\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.missstudio.design/",
      "https://missstudio.simplybook.asia/v2/",
      "https://escape.bar/firm/10282"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u8B0E\u5931\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u5931\u7269\u62DB\u9818\u70BA\u6843\u5712\u5C71\u5B50\u9802\u5E97\u4E3B\u984C\uFF0C2\u20134 \u4EBA\u4E26\u6A19\u793A\u6050\u6016\uFF0F\u61F8\u7591\u5143\u7D20\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74\u4E0A\u534A\u5E74"
  },
  {
    id: "popular-142",
    name: "301\u865F\u623F",
    venue_name: "\u8B0E\u5931\u5DE5\u4F5C\u5BA4\uFF5C\u6843\u5712\u5C71\u5B50\u9802\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u5C71\u5B50\u9802\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "2\u20134",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 3,
    brain: 3,
    styles: [
      "\u65C5\u793E\u61F8\u7591",
      "\u7570\u6A23\u6C1B\u570D"
    ],
    booking_url: "https://www.missstudio.design/",
    source_urls: [
      "https://www.missstudio.design/",
      "https://missstudio.simplybook.asia/v2/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A301\u865F\u623F\u300B\u4EE5\u65C5\u793E\u6E05\u6F54\u4EFB\u52D9\u8207\u7570\u6A23\u6C1B\u570D\u5C55\u958B\u61F8\u7591\u6545\u4E8B\uFF0C\u9069\u5408\u5C0F\u968A\u5408\u4F5C\u63A2\u7D22\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.missstudio.design/",
      "https://missstudio.simplybook.asia/v2/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u8B0E\u5931\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA 301 \u865F\u623F\u70BA\u6843\u5712\u5C71\u5B50\u9802\u5E97\u4E3B\u984C\uFF0C2\u20134 \u4EBA\u4E26\u6A19\u793A\u65C5\u793E\u6E05\u6F54\uFF0F\u61F8\u7591\uFF0F\u7570\u6A23\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74\u4E0A\u534A\u5E74"
  },
  {
    id: "popular-143",
    name: "\u85DD\u6A23\u7684\u4EE3\u50F9",
    venue_name: "\u8B0E\u5931\u5DE5\u4F5C\u5BA4\uFF5C\u6843\u5712\u4E2D\u58E2\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u602A\u76DC\u4EFB\u52D9",
      "\u6500\u722C\u9AD4\u9A57"
    ],
    booking_url: "https://www.missstudio.design/",
    source_urls: [
      "https://www.missstudio.design/",
      "https://missstudio.simplybook.asia/v2/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u85DD\u6A23\u7684\u4EE3\u50F9\u300B\u4EE5\u602A\u76DC\u7ACA\u53D6\u79D8\u5BF6\u70BA\u4EFB\u52D9\u4E3B\u8EF8\uFF0C\u52A0\u5165\u9AD4\u529B\u8207\u6500\u722C\u6311\u6230\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.missstudio.design/",
      "https://missstudio.simplybook.asia/v2/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u8B0E\u5931\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u85DD\u6A23\u7684\u4EE3\u50F9\u70BA\u6843\u5712\u4E2D\u58E2\u5E97\u4E3B\u984C\uFF0C2\u20136 \u4EBA\u4E26\u6A19\u793A\u602A\u76DC\u3001\u7ACA\u53D6\u79D8\u5BF6\u8207\u6500\u722C\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74\u4E0A\u534A\u5E74"
  },
  {
    id: "popular-144",
    name: "\u6731\u7802",
    venue_name: "\u8B0E\u5931\u5DE5\u4F5C\u5BA4\uFF5C\u6843\u5712\u4E2D\u58E2\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "2\u20136",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 2,
    brain: 4,
    styles: [
      "\u61F8\u7591\u63A8\u7406",
      "\u5FAE\u9A5A\u609A"
    ],
    booking_url: "https://www.missstudio.design/",
    source_urls: [
      "https://www.missstudio.design/",
      "https://missstudio.simplybook.asia/v2/"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u6731\u7802\u300B\u4EE5\u83DC\u9CE5\u8B66\u54E1\u8ABF\u67E5\u61F8\u6848\u70BA\u6545\u4E8B\u5165\u53E3\uFF0C\u7D50\u5408\u8A3A\u6240\u5834\u666F\u8207\u5FAE\u9A5A\u609A\u63A8\u7406\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://www.missstudio.design/",
      "https://missstudio.simplybook.asia/v2/"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u8B0E\u5931\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u6731\u7802\u70BA\u6843\u5712\u4E2D\u58E2\u5E97\u4E3B\u984C\uFF0C2\u20136 \u4EBA\u4E26\u6A19\u793A\u61F8\u7591\u8207\u5FAE\u9A5A\u609A\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74\u5E74\u4E2D"
  },
  {
    id: "popular-145",
    name: "\u4F34",
    venue_name: "\u95C7\u9593\u5DE5\u4F5C\u5BA4\uFF5C\u4E2D\u58E2\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 3,
    styles: [
      "\u6EAB\u99A8\u6D6A\u6F2B",
      "\u6C42\u5A5A\u5BA2\u88FD"
    ],
    booking_url: "https://darkfileescape.com/",
    source_urls: [
      "https://darkfileescape.com/",
      "https://darkfileescape.boostime.me/activities/couple"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u4F34\u300B\u662F\u95C7\u9593\u4E2D\u58E2\u5E97\u7684\u6EAB\u99A8\u6D6A\u6F2B\u4E3B\u984C\uFF0C\u4EA6\u63D0\u4F9B\u5BA2\u88FD\u6C42\u5A5A\u9AD4\u9A57\uFF0C\u5B8C\u6574\u4EBA\u6578\u8207\u6642\u9593\u4EE5\u9810\u7D04\u9801\u70BA\u6E96\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://darkfileescape.com/",
      "https://darkfileescape.boostime.me/activities/couple"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u95C7\u9593\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u4F34\u70BA\u4E2D\u58E2\u5E97\u4E3B\u984C\uFF0C\u6A19\u793A\u6EAB\u99A8\u6D6A\u6F2B\u3001\u4E8C\u4EBA\u958B\u5718\u8207\u5BA2\u88FD\u6C42\u5A5A\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74\u5E74\u4E2D"
  },
  {
    id: "popular-146",
    name: "\u6028\u61B6",
    venue_name: "\u95C7\u9593\u5DE5\u4F5C\u5BA4\uFF5C\u4E2D\u58E2\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 5,
    brain: 4,
    styles: [
      "\u6050\u6016\u9A5A\u609A",
      "\u591A\u4EBA\u5408\u4F5C",
      "\u8EAB\u6B77\u5176\u5883"
    ],
    booking_url: "https://darkfileescape.com/",
    source_urls: [
      "https://darkfileescape.com/",
      "https://darkfileescape.boostime.me/activities/resentmemory"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u6028\u61B6\u300B\u4EE5\u6050\u6016\u9A5A\u609A\u3001\u591A\u4EBA\u5408\u4F5C\u8207\u8EAB\u6B77\u5176\u5883\u70BA\u4E3B\u8EF8\uFF0C\u5B8C\u6574\u4EBA\u6578\u8207\u6642\u9593\u4EE5\u9810\u7D04\u9801\u70BA\u6E96\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://darkfileescape.com/",
      "https://darkfileescape.boostime.me/activities/resentmemory"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u95C7\u9593\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u6028\u61B6\u70BA\u4E2D\u58E2\u5E97\u4E3B\u984C\uFF0C\u6A19\u793A\u6050\u6016\u9A5A\u609A\u3001\u591A\u4EBA\u5408\u4F5C\u8207\u8EAB\u6B77\u5176\u5883\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74\u5E74\u4E2D"
  },
  {
    id: "popular-147",
    name: "\u5EB7\u6A02\u4FDD\u885B\u6230",
    venue_name: "\u95C7\u9593\u5DE5\u4F5C\u5BA4\uFF5C\u4E2D\u58E2\u5E97",
    city: "\u6843\u5712\u5E02",
    district: "\u4E2D\u58E2\u5E97",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    duration: "\u4F9D\u5B98\u7DB2\u516C\u544A",
    horror: 1,
    brain: 3,
    styles: [
      "\u9663\u71DF\u904A\u6232",
      "\u6A5F\u95DC\u64CD\u4F5C",
      "\u591A\u4EBA\u6D3E\u5C0D"
    ],
    booking_url: "https://darkfileescape.com/",
    source_urls: [
      "https://darkfileescape.com/",
      "https://darkfileescape.boostime.me/activities/colondefense"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u5EB7\u6A02\u4FDD\u885B\u6230\u300B\u4EE5\u8EAB\u5206\u9663\u71DF\u8207\u6A5F\u95DC\u64CD\u4F5C\u70BA\u4E3B\u8EF8\uFF0C\u63D0\u4F9B\u8F03\u8F15\u9B06\u7684\u591A\u4EBA\u6D3E\u5C0D\u578B\u5BC6\u5BA4\u9AD4\u9A57\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://darkfileescape.com/",
      "https://darkfileescape.boostime.me/activities/colondefense"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u95C7\u9593\u5B98\u65B9\u7DB2\u7AD9\u5217\u51FA\u5EB7\u6A02\u4FDD\u885B\u6230\u70BA\u4E2D\u58E2\u5E97\u4E3B\u984C\uFF0C\u6A19\u793A\u591A\u4EBA\u6D3E\u5C0D\u3001\u8EAB\u5206\u9663\u71DF\u8207\u6A5F\u95DC\u64CD\u4F5C\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74\u4E0B\u534A\u5E74"
  },
  {
    id: "popular-148",
    name: "\u5BF6\u5BF6\u7761",
    venue_name: "\u63EA\u63EA\u73A9\u5BC6\u5BA4\u9003\u812B",
    city: "\u5B9C\u862D\u5E02",
    district: "\u7F85\u6771\u93AE\uFF5C\u4E2D\u83EF\u8DEF",
    google_rating: null,
    rating_scope: "\u672A\u63A1\u7528\u672A\u6838\u5BE6\u7684\u6578\u5B57\u8A55\u50F9\uFF1B\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u7CBE\u9078",
    players: "2\u20136",
    duration: "90\u5206\u9418",
    horror: 3,
    brain: 3,
    styles: [
      "\u6C89\u6D78\u6F14\u7E79",
      "\u6050\u6016\u61F8\u7591",
      "\u5718\u968A\u5408\u4F5C"
    ],
    booking_url: "https://joinplay.com.tw/",
    source_urls: [
      "https://joinplay.com.tw/",
      "https://joinplay.boostime.me/activities/cnrotssg",
      "https://escape.bar/game/25384"
    ],
    google_rating_scope: "\u672A\u63A1\u7528\u6578\u5B57\u8A55\u50F9",
    pros: [
      "\u5834\u666F\u71DF\u9020\u5177\u6C89\u6D78\u611F",
      "\u8B0E\u984C\u8207\u5287\u60C5\u5177\u6311\u6230\u6027"
    ],
    cons: [
      "\u71B1\u9580\u6642\u6BB5\u5EFA\u8B70\u63D0\u65E9\u78BA\u8A8D"
    ],
    data_quality: "official_topic_page_plus_public_cross_check",
    duration_source: "\u5B98\u65B9\u4E3B\u984C\u9801\u6216\u5B98\u65B9\u9810\u7D04\u8CC7\u8A0A",
    editorial_scale_scope: "\u7DE8\u8F2F\u90E8\u5C0E\u89BD\u5206\u7D1A\uFF1B\u975E\u5B98\u65B9\u96E3\u5EA6\u6216\u73A9\u5BB6\u8A55\u5206",
    editorial_scale_note: "\u6050\u6016\uFF0F\u71D2\u8166\u70BA\u7DE8\u8F2F\u90E8 1\u20135 \u5C0E\u89BD\u5206\u7D1A\uFF0C\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u4E3B\u984C\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u5B98\u65B9\u6A19\u793A\u6216\u73A9\u5BB6\u8A55\u5206\u3002",
    story_summary: "\u300A\u5BF6\u5BF6\u7761\u300B\u4EE5\u5B89\u7720\u66F2\u3001\u5931\u8E64\u5925\u4F34\u8207\u9580\u5916\u54ED\u8072\u958B\u5834\uFF0C\u5C07\u5B9C\u862D\u7F85\u6771\u63EA\u63EA\u73A9\u7684\u6C89\u6D78\u6F14\u7E79\u8207\u5718\u968A\u89E3\u8B0E\u7D50\u5408\u3002",
    story_summary_provenance: "official_topic_page_plus_public_cross_check",
    story_summary_source_urls: [
      "https://joinplay.com.tw/",
      "https://joinplay.boostime.me/activities/cnrotssg",
      "https://escape.bar/game/25384"
    ],
    story_summary_note: "\u6B64\u70BA\u5C0E\u89BD\u6458\u8981\uFF0C\u50C5\u4F9D\u5B98\u65B9\u4E3B\u984C\u8CC7\u6599\u8207\u516C\u958B\u4F86\u6E90\u6574\u7406\uFF1B\u4EBA\u6578\u3001\u6642\u9593\u8207\u5834\u6B21\u4F9D\u5B98\u7DB2\u516C\u544A\u3002",
    story_summary_source_excerpt: "\u63EA\u63EA\u73A9\u5B98\u65B9\u7DB2\u7AD9\u8207\u9810\u7D04\u9801\u78BA\u8A8D\u5BF6\u5BF6\u7761\u70BA\u5B9C\u862D\u7F85\u6771\u4E3B\u984C\uFF0C90 \u5206\u9418\u30012\u20136 \u4EBA\u4E26\u63D0\u4F9B\u6C42\u6551\u6A5F\u5236\u3002",
    tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
    tag_provenance_note: "\u5C0E\u89BD\u6A19\u7C64\u4F9D\u5B98\u65B9\u4E3B\u984C\u63CF\u8FF0\u8207\u516C\u958B\u8CC7\u6599\u6574\u7406\uFF1B\u4E0D\u4EE3\u8868\u73A9\u5BB6\u5BE6\u6E2C\u5FC3\u5F97\u6216\u5B98\u65B9\u627F\u8AFE\u3002",
    release_time: "2024 \u5E74\u4E0B\u534A\u5E74"
  }
];

// server/_core/map.ts
function getMapsConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Google Maps proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey
  };
}
async function makeRequest(endpoint, params = {}, options = {}) {
  const { baseUrl, apiKey } = getMapsConfig();
  const url = new URL(`${baseUrl}/v1/maps/proxy${endpoint}`);
  url.searchParams.append("key", apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== void 0 && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : void 0
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Maps API request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }
  return await response.json();
}

// server/places.ts
async function searchEscapeVenues(query) {
  const result = await makeRequest("/maps/api/place/textsearch/json", {
    query: `${query} \u5BC6\u5BA4\u9003\u812B \u53F0\u7063`,
    language: "zh-TW",
    region: "tw"
  });
  if (result.status !== "OK" && result.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places returned status ${result.status}`);
  }
  const candidates = (result.results ?? []).filter((place) => place.place_id && place.name).slice(0, 20);
  const detailed = await Promise.all(candidates.map(async (place) => {
    try {
      const details = await makeRequest("/maps/api/place/details/json", {
        place_id: place.place_id,
        fields: "place_id,name,formatted_address,website,rating,user_ratings_total,business_status",
        language: "zh-TW"
      });
      const item = details.result;
      return {
        placeId: item.place_id,
        name: item.name,
        address: item.formatted_address,
        rating: item.rating ?? null,
        reviewCount: item.user_ratings_total ?? 0,
        businessStatus: null,
        website: item.website ?? null,
        source: "google_places_proxy",
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    } catch {
      return {
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating ?? null,
        reviewCount: place.user_ratings_total ?? 0,
        businessStatus: place.business_status ?? null,
        website: null,
        source: "google_places_proxy",
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
  }));
  return detailed.filter((place) => place.rating !== null && place.rating >= 4.5);
}

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";
var ANONYMOUS_COMMENT_COOKIE = "escape-anonymous-id";
var ANONYMOUS_COMMENT_COOLDOWN_MS = 3e4;
var anonymousCommentSubmissions = /* @__PURE__ */ new Map();
function getAnonymousCommentToken(req) {
  const token = parseCookie(req.headers.cookie ?? "")[ANONYMOUS_COMMENT_COOKIE];
  return token && /^[a-f0-9-]{36}$/i.test(token) ? token : null;
}
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  places: router({
    searchEscapeVenues: adminProcedure.input(z2.object({ query: z2.string().trim().min(2).max(80) })).query(({ input }) => searchEscapeVenues(input.query))
  }),
  comments: router({
    list: publicProcedure.input(z2.object({ topicId: z2.string().refine((topicId) => topics_default.some((topic) => topic.id === topicId), "\u4E3B\u984C\u4E0D\u5B58\u5728") })).query(({ ctx, input }) => getTopicComments(input.topicId, ctx.user?.id ?? null, ctx.user ? null : getAnonymousCommentToken(ctx.req))),
    create: publicProcedure.input(z2.object({
      topicId: z2.string().refine((topicId) => topics_default.some((topic) => topic.id === topicId), "\u4E3B\u984C\u4E0D\u5B58\u5728"),
      body: z2.string().trim().min(1, "\u8A55\u8AD6\u5167\u5BB9\u4E0D\u53EF\u70BA\u7A7A").max(2e3, "\u8A55\u8AD6\u5167\u5BB9\u4E0D\u53EF\u8D85\u904E 2000 \u5B57")
    })).mutation(async ({ ctx, input }) => {
      const existingAnonymousToken = getAnonymousCommentToken(ctx.req);
      let anonymousToken = null;
      if (!ctx.user) {
        const token = existingAnonymousToken ?? randomUUID();
        anonymousToken = token;
        const lastSubmission = anonymousCommentSubmissions.get(token);
        if (lastSubmission && Date.now() - lastSubmission < ANONYMOUS_COMMENT_COOLDOWN_MS) {
          throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "\u533F\u540D\u7559\u8A00\u8ACB\u7A0D\u5019 30 \u79D2\u518D\u8A66" });
        }
        anonymousCommentSubmissions.set(token, Date.now());
        if (!existingAnonymousToken) {
          ctx.res.cookie(ANONYMOUS_COMMENT_COOKIE, token, {
            ...getSessionCookieOptions(ctx.req),
            maxAge: ONE_YEAR_MS
          });
        }
      }
      await createTopicComment({
        topicId: input.topicId,
        userId: ctx.user?.id ?? null,
        anonymousToken,
        authorName: ctx.user?.name?.trim() || ctx.user?.email?.split("@")[0] || "\u533F\u540D\u63A2\u7D22\u8005",
        body: input.body
      });
      return { success: true };
    }),
    delete: publicProcedure.input(z2.object({ commentId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const result = await deleteTopicComment(input.commentId, ctx.user?.id ?? null, getAnonymousCommentToken(ctx.req));
      if (result === "not_found") {
        throw new TRPCError3({ code: "NOT_FOUND", message: "\u627E\u4E0D\u5230\u9019\u5247\u8A55\u8AD6" });
      }
      if (result === "forbidden") {
        throw new TRPCError3({ code: "FORBIDDEN", message: "\u53EA\u80FD\u522A\u9664\u81EA\u5DF1\u7684\u8A55\u8AD6" });
      }
      return { success: true };
    })
  }),
  contact: router({
    submit: publicProcedure.input(z2.object({
      name: z2.string().trim().max(120).optional(),
      email: z2.string().trim().email().max(320).optional().or(z2.literal("")),
      subject: z2.string().trim().min(1).max(80),
      message: z2.string().trim().min(10).max(5e3)
    })).mutation(async ({ input }) => {
      await createContactMessage({
        name: input.name || null,
        email: input.email || null,
        subject: input.subject,
        message: input.message
      });
      return { success: true };
    })
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";
import { randomUUID as randomUUID2 } from "node:crypto";
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
var GOOGLE_STATE_COOKIE = "google_oauth_state";
var GOOGLE_ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://taipeiesc-97ma7evx.manus.space",
  "https://taiwanesc-97ma7evx.manus.space",
  "https://www.tw-escapeindex.com",
  "https://tw-escapeindex.com",
  "http://localhost:3000"
]);
function isAllowedGoogleOrigin(value) {
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search || url.hash) return false;
    if (GOOGLE_ALLOWED_ORIGINS.has(value)) return true;
    return url.protocol === "https:" && (url.hostname.endsWith(".manus.space") || url.hostname.endsWith(".manus.computer"));
  } catch {
    return false;
  }
}
function encodeGoogleState(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}
function decodeGoogleState(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed.nonce || !parsed.returnTo || !isAllowedGoogleOrigin(parsed.returnTo)) return null;
    return { nonce: parsed.nonce, returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}
function googleRedirectUri(origin) {
  return `${origin}/api/google/callback`;
}
function normalizeGoogleAvatarUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
function registerOAuthRoutes(app2) {
  app2.get("/api/google/login", (req, res) => {
    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.status(503).json({ error: "Google OAuth is not configured" });
      return;
    }
    const returnTo = getQueryParam(req, "returnTo");
    if (!returnTo || !isAllowedGoogleOrigin(returnTo)) {
      res.status(400).json({ error: "Invalid Google OAuth return URL" });
      return;
    }
    const nonce = randomUUID2();
    const redirectUri = googleRedirectUri(returnTo);
    const state = encodeGoogleState({ nonce, returnTo });
    res.cookie(GOOGLE_STATE_COOKIE, nonce, {
      ...getSessionCookieOptions(req),
      sameSite: "lax",
      maxAge: 10 * 60 * 1e3
    });
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("client_id", ENV.googleClientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid email profile");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("prompt", "select_account");
    res.redirect(302, authorizationUrl.toString());
  });
  app2.get("/api/google/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const stateValue = getQueryParam(req, "state");
    const state = stateValue ? decodeGoogleState(stateValue) : null;
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[GOOGLE_STATE_COOKIE];
    if (!code || !state || !expectedNonce || state.nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid Google OAuth state" });
      return;
    }
    res.clearCookie(GOOGLE_STATE_COOKIE, { ...getSessionCookieOptions(req), sameSite: "lax" });
    try {
      const redirectUri = googleRedirectUri(state.returnTo);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });
      if (!tokenResponse.ok) throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
      const tokenPayload = await tokenResponse.json();
      if (!tokenPayload.access_token) throw new Error("Google access token missing");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${tokenPayload.access_token}` }
      });
      if (!profileResponse.ok) throw new Error(`Google userinfo failed: ${profileResponse.status}`);
      const profile = await profileResponse.json();
      if (!profile.sub || !profile.email) throw new Error("Google profile is missing required fields");
      const openId = `google:${profile.sub}`;
      await upsertUser({
        openId,
        name: profile.name || profile.email.split("@")[0],
        email: profile.email,
        avatarUrl: normalizeGoogleAvatarUrl(profile.picture),
        loginMethod: "google",
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: profile.name || profile.email,
        expiresInMs: ONE_YEAR_MS
      });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, `${state.returnTo}/`);
    } catch (error) {
      console.error("[Google OAuth] Callback failed", error);
      res.status(502).json({ error: "Google OAuth callback failed" });
    }
  });
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
import { Readable } from "node:stream";
async function serveStorageAsset(req, res) {
  const key = req.params[0];
  if (!key) {
    res.status(400).send("Missing storage key");
    return;
  }
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    res.status(500).send("Storage proxy not configured");
    return;
  }
  try {
    const forgeUrl = new URL(
      "v1/storage/presign/get",
      ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
    );
    forgeUrl.searchParams.set("path", key);
    const forgeResp = await fetch(forgeUrl, {
      headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
    });
    if (!forgeResp.ok) {
      const body = await forgeResp.text().catch(() => "");
      console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
      res.status(502).send("Storage backend error");
      return;
    }
    const { url } = await forgeResp.json();
    if (!url) {
      res.status(502).send("Empty signed URL from backend");
      return;
    }
    const assetResp = await fetch(url);
    if (!assetResp.ok || !assetResp.body) {
      const body = await assetResp.text().catch(() => "");
      console.error(`[StorageProxy] asset error: ${assetResp.status} ${body}`);
      res.status(502).send("Storage asset unavailable");
      return;
    }
    const contentType = assetResp.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = assetResp.headers.get("content-length");
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      ...contentLength ? { "Content-Length": contentLength } : {}
    });
    Readable.fromWeb(assetResp.body).pipe(res);
  } catch (err) {
    console.error("[StorageProxy] failed:", err);
    res.status(502).send("Storage proxy error");
  }
}
function registerStorageProxy(app2) {
  app2.get("/media/*", serveStorageAsset);
  app2.get("/manus-storage/*", serveStorageAsset);
}

// server/app.ts
function createApp() {
  const app2 = express();
  app2.set("trust proxy", 1);
  app2.use(express.json({ limit: "50mb" }));
  app2.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app2;
}

// server/vercel-entry.ts
var app = createApp();
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
