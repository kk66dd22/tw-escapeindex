import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
const faviconUrl = "/media/escape-index-user-keyhole_b38d77fa.png";

describe("網站圖示設定", () => {
  it("提供瀏覽器分頁與 Apple 裝置捷徑圖示", () => {
    expect(indexHtml).toContain(`<link rel="icon" type="image/png" sizes="54x55" href="${faviconUrl}" />`);
    expect(indexHtml).toContain(`<link rel="apple-touch-icon" sizes="54x55" href="${faviconUrl}" />`);
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-title" content="密室導覽" />');
  });
});
