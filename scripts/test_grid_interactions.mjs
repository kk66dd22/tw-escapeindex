import { chromium } from "playwright";

const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const results = [];
for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  const input = page.locator("#catalog-search");
  await input.scrollIntoViewIfNeeded();
  const pageTwo = page.getByRole("button", { name: "2", exact: true });
  if (await pageTwo.count() !== 1) throw new Error(`${viewport.width}px 找不到第 2 頁頁碼`);
  await pageTwo.click();
  const pageStatus = page.getByText(/PAGE \d+ \/ \d+ · SHOWING/);
  await pageStatus.waitFor();
  const pageTwoText = await pageStatus.textContent();
  if (!pageTwoText?.startsWith("PAGE 02")) throw new Error(`${viewport.width}px 點擊第 2 頁後狀態錯誤：${pageTwoText}`);
  await input.fill("台中");
  await page.getByRole("button", { name: "恐怖驚悚" }).click();
  await page.locator("#room-sort").selectOption("horror");
  const status = page.getByText(/PAGE \d+ \/ \d+ · SHOWING/);
  await status.waitFor();
  const statusText = await status.textContent();
  if (!statusText?.startsWith("PAGE 01")) throw new Error(`${viewport.width}px 篩選／排序後未停在第 1 頁：${statusText}`);
  await input.fill("");
  await page.getByRole("button", { name: "清除線索" }).count();
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  if (overflow.scrollWidth > overflow.innerWidth + 1) throw new Error(`${viewport.width}px 互動後出現水平溢出`);
  results.push({ width: viewport.width, search: true, filter: true, sort: "horror", paginationReset: true, overflow: false });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
