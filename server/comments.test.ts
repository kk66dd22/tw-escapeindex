import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  getTopicComments: vi.fn(),
  createTopicComment: vi.fn(),
  deleteTopicComment: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

function createContext(user: TrpcContext["user"] = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("comments router", () => {
  it("returns the public comment list for a valid topic", async () => {
    dbMocks.getTopicComments.mockResolvedValueOnce([]);

    const result = await appRouter.createCaller(createContext()).comments.list({ topicId: "popular-101" });

    expect(result).toEqual([]);
    expect(dbMocks.getTopicComments).toHaveBeenCalledWith("popular-101");
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
      body: "使用者輸入內容",
    });
  });

  it("rejects unauthenticated creation, unknown topics, and blank comments", async () => {
    await expect(
      appRouter.createCaller(createContext()).comments.create({ topicId: "popular-101", body: "使用者輸入內容" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

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
    expect(dbMocks.deleteTopicComment).toHaveBeenCalledWith(7, 42);

    dbMocks.deleteTopicComment.mockResolvedValueOnce("forbidden");
    await expect(appRouter.createCaller(createContext(user)).comments.delete({ commentId: 8 })).rejects.toMatchObject({ code: "FORBIDDEN", message: "只能刪除自己的評論" });

    dbMocks.deleteTopicComment.mockResolvedValueOnce("not_found");
    await expect(appRouter.createCaller(createContext(user)).comments.delete({ commentId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "找不到這則評論" });

    await expect(appRouter.createCaller(createContext()).comments.delete({ commentId: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
