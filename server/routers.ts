import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { createContactMessage, createTopicComment, deleteTopicComment, getTopicComments, updateTopicComment } from "./db";

import topics from "../data/topics.json";
import { searchEscapeVenues } from "./places";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const ANONYMOUS_AVATAR_IDS = z.enum([
  "detective",
  "mechanism",
  "keymaster",
  "lamplighter",
  "timekeeper",
  "lockbreaker",
  "gatekeeper",
  "navigator",
]);

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(() => null),
  }),

  places: router({
    searchEscapeVenues: adminProcedure
      .input(z.object({ query: z.string().trim().min(2).max(80) }))
      .query(({ input }) => searchEscapeVenues(input.query)),
  }),

  comments: router({
    list: publicProcedure
      .input(z.object({ topicId: z.string().refine((topicId) => topics.some((topic) => topic.id === topicId), "主題不存在") }))
      .query(async ({ input }) => {
        try {
          return await getTopicComments(input.topicId, null, null);
        } catch (error) {
          console.error("[Comments] Public list unavailable", error);
          return [];
        }
      }),
    create: publicProcedure
      .input(z.object({
        topicId: z.string().refine((topicId) => topics.some((topic) => topic.id === topicId), "主題不存在"),
        body: z.string().trim().min(1, "評論內容不可為空").max(2000, "評論內容不可超過 2000 字"),
        authorName: z.string().trim().min(1, "請輸入暱稱").max(120, "暱稱不可超過 120 字"),
        anonymousToken: z.string().uuid("匿名識別碼格式不正確"),
        avatarId: ANONYMOUS_AVATAR_IDS,
      }))
      .mutation(async ({ input }) => {
        await createTopicComment({
          topicId: input.topicId,
          userId: null,
          anonymousToken: input.anonymousToken,
          authorName: input.authorName,
          avatarId: input.avatarId,
          body: input.body,
        });
        return { success: true } as const;
      }),
    update: publicProcedure
      .input(z.object({
        id: z.number().int().positive(),
        body: z.string().trim().min(1, "評論內容不可為空").max(2000, "評論內容不可超過 2000 字"),
        anonymousToken: z.string().uuid("匿名識別碼格式不正確"),
      }))
      .mutation(async ({ input }) => {
        const result = await updateTopicComment(input.id, input.body, input.anonymousToken);
        if (result === "not_found") throw new TRPCError({ code: "NOT_FOUND", message: "找不到這則評論" });
        if (result === "forbidden") throw new TRPCError({ code: "FORBIDDEN", message: "只能編輯自己的評論" });
        return { success: true } as const;
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive(), anonymousToken: z.string().uuid("匿名識別碼格式不正確") }))
      .mutation(async ({ input }) => {
        const result = await deleteTopicComment(input.id, null, input.anonymousToken);
        if (result === "not_found") {
          throw new TRPCError({ code: "NOT_FOUND", message: "找不到這則評論" });
        }
        if (result === "forbidden") {
          throw new TRPCError({ code: "FORBIDDEN", message: "只能刪除自己的評論" });
        }
        return { success: true } as const;
      }),
  }),

  contact: router({
    submit: publicProcedure
      .input(z.object({
        name: z.string().trim().max(120).optional(),
        email: z.string().trim().email().max(320).optional().or(z.literal("")),
        subject: z.string().trim().min(1).max(80),
        message: z.string().trim().min(10).max(5000),
      }))
      .mutation(async ({ input }) => {
        await createContactMessage({
          name: input.name || null,
          email: input.email || null,
          subject: input.subject,
          message: input.message,
        });
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
