import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  const cookieHeader = opts.req.headers.cookie;
  const authorizationHeader = opts.req.headers.authorization;
  const hasCredentials = Boolean(
    cookieHeader ||
      (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")),
  );

  if (hasCredentials) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures. Protected procedures
      // still reject the request through requireUser in trpc.ts.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
