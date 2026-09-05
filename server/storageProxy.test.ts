import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerStorageProxy } from "./_core/storageProxy";

type Handler = (req: unknown, res: any) => Promise<void>;

describe("registerStorageProxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams the signed image through the same origin with an inline content type", async () => {
    let handler: Handler | undefined;
    const app = {
      get: vi.fn((_path: string, routeHandler: Handler) => {
        handler = routeHandler;
      }),
    };

    const signedAsset = new Response(new Uint8Array([82, 73, 70, 70]), {
      status: 200,
      headers: {
        "content-type": "image/webp",
        "content-length": "4",
      },
    });
    const forgeResponse = new Response(JSON.stringify({ url: "https://cdn.example.test/signed.webp" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(forgeResponse)
      .mockResolvedValueOnce(signedAsset);

    registerStorageProxy(app as any);
    expect(app.get).toHaveBeenCalledWith("/media/*", expect.any(Function));
    expect(app.get).toHaveBeenCalledWith("/manus-storage/*", expect.any(Function));
    expect(handler).toBeDefined();

    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", chunk => chunks.push(Buffer.from(chunk)));
    const setHeaders = vi.fn();
    const res = Object.assign(output, {
      set: setHeaders,
      status: vi.fn(() => res),
      send: vi.fn(),
    });

    await handler!({ params: { 0: "brand-sigil.png" } }, res);
    await new Promise<void>(resolve => output.on("end", resolve));

    expect(setHeaders).toHaveBeenCalledWith(expect.objectContaining({
      "Content-Type": "image/webp",
      "Content-Disposition": "inline",
      "Content-Length": "4",
    }));
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([82, 73, 70, 70]));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
