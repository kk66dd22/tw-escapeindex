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

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const token = "11111111-1111-4111-8111-111111111111";

describe("comments router", () => {
  it("normalizes missing public comment author names", () => {
    expect(normalizeTopicCommentAuthor("  玩家  ")).toBe("玩家");
    expect(normalizeTopicCommentAuthor(null)).toBe("探索者");
  });

  it("returns the public comment list without authentication", async () => {
    dbMocks.getTopicComments.mockResolvedValueOnce([]);
    const result = await appRouter.createCaller(createContext()).comments.list({ topicId: "popular-101" });
    expect(result).toEqual([]);
    expect(dbMocks.getTopicComments).toHaveBeenCalledWith("popular-101", null, null);
  });

  it("creates an anonymous comment with nickname and token", async () => {
    dbMocks.createTopicComment.mockResolvedValueOnce(undefined);
    const result = await appRouter.createCaller(createContext()).comments.create({
      topicId: "popular-101",
      body: "訪客體驗",
      authorName: "探險家_1234",
      anonymousToken: token,
    });
    expect(result).toEqual({ success: true });
    expect(dbMocks.createTopicComment).toHaveBeenCalledWith({
      topicId: "popular-101",
      userId: null,
      anonymousToken: token,
      authorName: "探險家_1234",
      body: "訪客體驗",
    });
  });

  it("allows anonymous owners to delete with the same token", async () => {
    dbMocks.deleteTopicComment.mockResolvedValueOnce("deleted");
    await expect(appRouter.createCaller(createContext()).comments.delete({ commentId: 7, anonymousToken: token })).resolves.toEqual({ success: true });
    expect(dbMocks.deleteTopicComment).toHaveBeenCalledWith(7, null, token);
  });

  it("validates nickname, token, topic, and body", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.comments.create({ topicId: "popular-101", body: "留言", authorName: "訪客", anonymousToken: "bad" })).rejects.toThrow();
    await expect(caller.comments.create({ topicId: "missing-topic", body: "留言", authorName: "訪客", anonymousToken: token })).rejects.toThrow("主題不存在");
    await expect(caller.comments.create({ topicId: "popular-101", body: "   ", authorName: "訪客", anonymousToken: token })).rejects.toThrow("評論內容不可為空");
  });
});
