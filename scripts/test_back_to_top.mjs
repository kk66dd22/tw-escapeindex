import { chromium } from "playwright";

const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  const button = page.getByRole("button", { name: "回到頂部" });
  if (await button.count() !== 0) throw new Error(`按鈕在頂端不應顯示：${viewport.width}`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await button.waitFor({ state: "visible" });
  if (await button.getAttribute("aria-label") !== "回到頂部") throw new Error("缺少 aria-label");
  await button.click();
  await page.waitForFunction(() => window.scrollY < 8);
  await page.close();
}
console.log(JSON.stringify({ viewports: 2, behavior: "scrollY < 8 after click", accessibility: "aria-label=回到頂部" }, null, 2));
await browser.close();
