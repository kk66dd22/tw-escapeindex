import { chromium } from "playwright";

const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const results = [];
for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.locator("#catalog-search").scrollIntoViewIfNeeded();
  const grid = page.locator("#catalog .grid.gap-6").first();
  const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  const expected = viewport.width >= 1024 ? 2 : 1;
  if (columns !== expected) throw new Error(`${viewport.width}px 預期 ${expected} 欄，實際 ${columns} 欄`);
  if (overflow.scrollWidth > overflow.innerWidth + 1) throw new Error(`${viewport.width}px 發生水平溢出`);
  results.push({ width: viewport.width, columns, overflow: false });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
