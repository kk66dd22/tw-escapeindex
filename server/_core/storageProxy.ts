import { Readable } from "node:stream";
import type { Express, Request, Response } from "express";
import { ENV } from "./env";

async function serveStorageAsset(req: Request, res: Response) {
  const key = (req.params as Record<string, string>)[0];
  if (!key) {
    res.status(400).send("Missing storage key");
    return;
  }

  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    res.status(500).send("Storage proxy not configured");
    return;
  }

  try {
    const forgeUrl = new URL(
      "v1/storage/presign/get",
      ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
    );
    forgeUrl.searchParams.set("path", key);

    const forgeResp = await fetch(forgeUrl, {
      headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
    });

    if (!forgeResp.ok) {
      const body = await forgeResp.text().catch(() => "");
      console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
      res.status(502).send("Storage backend error");
      return;
    }

    const { url } = (await forgeResp.json()) as { url: string };
    if (!url) {
      res.status(502).send("Empty signed URL from backend");
      return;
    }

    // Keep the browser on our origin instead of redirecting to the signed
    // CloudFront URL. The /media route is intentionally separate from the
    // platform-managed /manus-storage route used by older assets.
    const assetResp = await fetch(url);
    if (!assetResp.ok || !assetResp.body) {
      const body = await assetResp.text().catch(() => "");
      console.error(`[StorageProxy] asset error: ${assetResp.status} ${body}`);
      res.status(502).send("Storage asset unavailable");
      return;
    }

    const contentType = assetResp.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = assetResp.headers.get("content-length");
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      ...(contentLength ? { "Content-Length": contentLength } : {}),
    });

    Readable.fromWeb(assetResp.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  } catch (err) {
    console.error("[StorageProxy] failed:", err);
    res.status(502).send("Storage proxy error");
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/media/*", serveStorageAsset);
  app.get("/manus-storage/*", serveStorageAsset);
}
