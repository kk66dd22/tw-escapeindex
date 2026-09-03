import { describe, expect, it, vi } from "vitest";
import { normalizeTopicCommentAuthor } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  getTopicComments: vi.fn(),
  createTopicComment: vi.fn(),
  deleteTopicComment: vi.fn(),
  normalizeTopicCommentAuthor: (authorName: string | null | undefined) => authorName?.trim() || "探索者",
}));

vi.mock("./db", () => dbMocks);

function createContext(user: TrpcContext["user"] = null, cookie = ""): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: { cookie } } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("comments router", () => {
  it("normalizes missing public comment author names", () => {
    expect(normalizeTopicCommentAuthor("  玩家  ")).toBe("玩家");
    expect(normalizeTopicCommentAuthor(null)).toBe("探索者");
    expect(normalizeTopicCommentAuthor("   ")).toBe("探索者");
  });

  it("returns the public comment list for a valid topic", async () => {
    dbMocks.getTopicComments.mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(createContext()).comments.list({ topicId: "popular-101" });

    expect(result).toEqual([]);
    expect(dbMocks.getTopicComments).toHaveBeenCalledWith("popular-101", null, null);
  });

  it("creates a comment with the authenticated user identity", async () => {
    const user = {
      id: 42,
      openId: "commenter",
      email: "commenter@example.com",
      name: "Commenter",
      loginMethod: "manus",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    dbMocks.createTopicComment.mockResolvedValueOnce(undefined);

    const result = await appRouter.createCaller(createContext(user)).comments.create({
      topicId: "popular-101",
      body: "使用者輸入內容",
    });

    expect(result).toEqual({ success: true });
    expect(dbMocks.createTopicComment).toHaveBeenCalledWith({
      topicId: "popular-101",
      userId: 42,
      anonymousToken: null,
      authorName: "Commenter",
      body: "使用者輸入內容",
    });
  });

  it("allows anonymous creation and validates topic and body", async () => {
    dbMocks.createTopicComment.mockResolvedValueOnce(undefined);
    const anonymousResult = await appRouter.createCaller(createContext()).comments.create({ topicId: "popular-101", body: "匿名使用者輸入內容" });
    expect(anonymousResult).toEqual({ success: true });
    expect(dbMocks.createTopicComment).toHaveBeenCalledWith(expect.objectContaining({
      topicId: "popular-101",
      userId: null,
      anonymousToken: expect.stringMatching(/^[a-f0-9-]{36}$/i),
      authorName: "匿名探索者",
    }));

    const cookie = "escape-anonymous-id=11111111-1111-4111-8111-111111111111";
    await expect(appRouter.createCaller(createContext(null, cookie)).comments.create({ topicId: "popular-101", body: "第二則匿名留言" })).resolves.toEqual({ success: true });
    await expect(appRouter.createCaller(createContext(null, cookie)).comments.create({ topicId: "popular-101", body: "冷卻期間留言" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    const user = {
      id: 42,
      openId: "commenter",
      email: null,
      name: "Commenter",
      loginMethod: "manus",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const caller = appRouter.createCaller(createContext(user));

    await expect(caller.comments.create({ topicId: "missing-topic", body: "使用者輸入內容" })).rejects.toThrow("主題不存在");
    await expect(caller.comments.create({ topicId: "popular-101", body: "   " })).rejects.toThrow("評論內容不可為空");
    await expect(caller.comments.create({ topicId: "popular-101", body: "x".repeat(2001) })).rejects.toThrow("評論內容不可超過 2000 字");
  });

  it("deletes only through the authenticated delete procedure", async () => {
    const user = {
      id: 42,
      openId: "commenter",
      email: null,
      name: "Commenter",
      loginMethod: "manus",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    dbMocks.deleteTopicComment.mockResolvedValueOnce("deleted");

    const result = await appRouter.createCaller(createContext(user)).comments.delete({ commentId: 7 });

    expect(result).toEqual({ success: true });
    expect(dbMocks.deleteTopicComment).toHaveBeenCalledWith(7, 42, null);

    dbMocks.deleteTopicComment.mockResolvedValueOnce("forbidden");
    await expect(appRouter.createCaller(createContext(user)).comments.delete({ commentId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN", message: "只能刪除自己的評論" });

    dbMocks.deleteTopicComment.mockResolvedValueOnce("not_found");
    await expect(appRouter.createCaller(createContext(user)).comments.delete({ commentId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "找不到這則評論" });

    dbMocks.deleteTopicComment.mockResolvedValueOnce("forbidden");
    await expect(appRouter.createCaller(createContext()).comments.delete({ commentId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
