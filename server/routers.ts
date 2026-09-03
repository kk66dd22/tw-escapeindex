import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookie } from "cookie";
import { randomUUID } from "node:crypto";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createContactMessage, createTopicComment, deleteTopicComment, getTopicComments } from "./db";

const ANONYMOUS_COMMENT_COOKIE = "escape-anonymous-id";
const ANONYMOUS_COMMENT_COOLDOWN_MS = 30_000;
const anonymousCommentSubmissions = new Map<string, number>();

function getAnonymousCommentToken(req: Parameters<typeof getSessionCookieOptions>[0]): string | null {
  const token = parseCookie(req.headers.cookie ?? "")[ANONYMOUS_COMMENT_COOKIE];
  return token && /^[a-f0-9-]{36}$/i.test(token) ? token : null;
}
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
      .query(({ ctx, input }) => getTopicComments(input.topicId, ctx.user?.id ?? null, ctx.user ? null : getAnonymousCommentToken(ctx.req))),
    create: publicProcedure
      .input(z.object({
        topicId: z.string().refine((topicId) => topics.some((topic) => topic.id === topicId), "主題不存在"),
        body: z.string().trim().min(1, "評論內容不可為空").max(2000, "評論內容不可超過 2000 字"),
      }))
      .mutation(async ({ ctx, input }) => {
        const existingAnonymousToken = getAnonymousCommentToken(ctx.req);
        let anonymousToken: string | null = null;
        if (!ctx.user) {
          const token = existingAnonymousToken ?? randomUUID();
          anonymousToken = token;
          const lastSubmission = anonymousCommentSubmissions.get(token);
          if (lastSubmission && Date.now() - lastSubmission < ANONYMOUS_COMMENT_COOLDOWN_MS) {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "匿名留言請稍候 30 秒再試" });
          }
          anonymousCommentSubmissions.set(token, Date.now());
          if (!existingAnonymousToken) {
            ctx.res.cookie(ANONYMOUS_COMMENT_COOKIE, token, {
              ...getSessionCookieOptions(ctx.req),
              maxAge: ONE_YEAR_MS,
            });
          }
        }
        await createTopicComment({
          topicId: input.topicId,
          userId: ctx.user?.id ?? null,
          anonymousToken,
          authorName: ctx.user?.name?.trim() || ctx.user?.email?.split("@")[0] || "匿名探索者",
          body: input.body,
        });
        return { success: true } as const;
      }),
    delete: publicProcedure
      .input(z.object({ commentId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const result = await deleteTopicComment(input.commentId, ctx.user?.id ?? null, getAnonymousCommentToken(ctx.req));
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
