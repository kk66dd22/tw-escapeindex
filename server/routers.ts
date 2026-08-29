import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { createContactMessage } from "./db";
import { searchEscapeVenues } from "./places";
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
