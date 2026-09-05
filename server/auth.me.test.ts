import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("auth.me", () => {
  it("returns the authenticated user including avatarUrl", async () => {
    const user = {
      id: 7,
      openId: "google:avatar-user",
      name: "Google 玩家",
      email: "player@gmail.com",
      avatarUrl: "https://lh3.googleusercontent.com/avatar",
      loginMethod: "google",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const ctx = {
      user,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } satisfies TrpcContext;

    const result = await appRouter.createCaller(ctx).auth.me();

    expect(result).toMatchObject({
      openId: "google:avatar-user",
      loginMethod: "google",
      avatarUrl: "https://lh3.googleusercontent.com/avatar",
    });
  });
});
