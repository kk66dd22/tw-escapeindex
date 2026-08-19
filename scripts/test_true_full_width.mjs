import { chromium } from "playwright";

const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const results = [];

const wide = await browser.newPage({ viewport: { width: 1891, height: 758 } });
await wide.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await wide.locator("#catalog").scrollIntoViewIfNeeded();
const wideMetrics = await wide.evaluate(() => {
  const catalog = document.querySelector("#catalog");
  const grid = document.querySelector("#catalog .grid.gap-6");
  const cards = [...document.querySelectorAll("#catalog .grid.gap-6 > article")];
  const rect = catalog?.getBoundingClientRect();
  const first = cards[0]?.getBoundingClientRect();
  const last = cards[1]?.getBoundingClientRect();
  return {
    viewport: window.innerWidth,
    catalogLeft: rect?.left ?? null,
    catalogRight: rect?.right ?? null,
    firstCardLeft: first?.left ?? null,
    secondCardRight: last?.right ?? null,
    gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
    pageScrollWidth: document.documentElement.scrollWidth,
  };
});
if (wideMetrics.gridColumns !== 2) throw new Error(`1891px 預期兩欄，實際 ${wideMetrics.gridColumns} 欄`);
if (wideMetrics.firstCardLeft > 40 || wideMetrics.secondCardRight < 1851) throw new Error(`1891px 卡片未延展至滿版安全邊界：${JSON.stringify(wideMetrics)}`);
if (wideMetrics.pageScrollWidth > 1891) throw new Error(`1891px 發生頁面水平溢出：${JSON.stringify(wideMetrics)}`);
results.push({ width: 1891, ...wideMetrics, passed: true });
await wide.close();

const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mobile.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await mobile.locator("#catalog-search").scrollIntoViewIfNeeded();
const pageTwo = mobile.locator('#catalog button').filter({ hasText: /^2$/ }).first();
await pageTwo.click();
if (!(await mobile.locator('#catalog button[aria-current="page"]').innerText()).trim().includes("2")) throw new Error("375px 無法切換至第 2 頁");
await mobile.locator("#catalog-search").fill("Mystoto");
if (!(await mobile.locator('#catalog button[aria-current="page"]').innerText()).trim().includes("1")) throw new Error("375px 搜尋後未重置至第 1 頁");
await mobile.locator("#room-sort").selectOption("horror");
const horrorButton = mobile.locator("section.sticky button").filter({ hasText: "恐怖驚悚" }).first();
await horrorButton.click();
const mobileMetrics = await mobile.evaluate(() => ({
  viewport: window.innerWidth,
  pageScrollWidth: document.documentElement.scrollWidth,
  columns: getComputedStyle(document.querySelector("#catalog .grid.gap-6")).gridTemplateColumns.split(" ").length,
  currentPage: document.querySelector('#catalog button[aria-current="page"]')?.textContent?.trim() ?? null,
}));
if (mobileMetrics.columns !== 1) throw new Error(`375px 預期單欄，實際 ${mobileMetrics.columns} 欄`);
if (mobileMetrics.pageScrollWidth > 375) throw new Error(`375px 發生頁面水平溢出：${JSON.stringify(mobileMetrics)}`);
results.push({ width: 375, ...mobileMetrics, passed: true });
await mobile.close();
await browser.close();
console.log(JSON.stringify(results, null, 2));
