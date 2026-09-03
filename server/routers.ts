import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createContactMessage, createTopicComment, deleteTopicComment, getTopicComments } from "./db";
import topics from "../data/topics.json";
import { searchEscapeVenues } from "./places";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  places: router({
    searchEscapeVenues: adminProcedure
      .input(z.object({ query: z.string().trim().min(2).max(80) }))
      .query(({ input }) => searchEscapeVenues(input.query)),
  }),

  comments: router({
    list: publicProcedure
      .input(z.object({ topicId: z.string().refine((topicId) => topics.some((topic) => topic.id === topicId), "主題不存在") }))
      .query(({ input }) => getTopicComments(input.topicId)),
    create: protectedProcedure
      .input(z.object({
        topicId: z.string().refine((topicId) => topics.some((topic) => topic.id === topicId), "主題不存在"),
        body: z.string().trim().min(1, "評論內容不可為空").max(2000, "評論內容不可超過 2000 字"),
      }))
      .mutation(async ({ ctx, input }) => {
        await createTopicComment({
          topicId: input.topicId,
          userId: ctx.user.id,
          authorName: ctx.user.name?.trim() || ctx.user.email?.split("@")[0] || "探索者",
          body: input.body,
        });
        return { success: true } as const;
      }),
    delete: protectedProcedure
      .input(z.object({ commentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const result = await deleteTopicComment(input.commentId, ctx.user.id);
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
