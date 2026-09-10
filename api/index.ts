import { createApp } from "../server/app";

const app = createApp();

/**
 * Explicit Vercel Node.js Function handler.
 * Keeping the adapter here avoids relying on framework auto-detection for an
 * Express instance exported from a nested api/ entrypoint.
 */
export default function handler(req: Parameters<typeof app>[0], res: Parameters<typeof app>[1]) {
  return app(req, res);
}
