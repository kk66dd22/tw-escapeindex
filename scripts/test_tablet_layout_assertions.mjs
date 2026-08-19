import { chromium } from "playwright";

const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.locator("#catalog-search").scrollIntoViewIfNeeded();
const result = await page.evaluate(() => {
  const grid = document.querySelector("#catalog .grid.gap-6");
  const cards = Array.from(document.querySelectorAll("#catalog article"));
  const badgeRows = cards.flatMap((card) => Array.from(card.querySelectorAll(".grid.grid-cols-2"))).slice(-cards.length);
  const badgeChecks = badgeRows.flatMap((row) => Array.from(row.querySelectorAll(".flex.flex-wrap"))).map((row) => {
    const spans = Array.from(row.querySelectorAll(":scope > span"));
    const tops = spans.map((span) => Math.round(span.getBoundingClientRect().top));
    return {
      clientWidth: row.clientWidth,
      scrollWidth: row.scrollWidth,
      overflowX: getComputedStyle(row).overflowX,
      singleLine: tops.length < 2 || new Set(tops).size === 1,
      height: row.getBoundingClientRect().height,
    };
  });
  const pagination = document.querySelector("#catalog > div.mt-10");
  const filterBar = document.querySelector("section.sticky > div");
  return {
    columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
    cardCount: cards.length,
    badgeChecks,
    pagination: pagination ? { clientWidth: pagination.clientWidth, scrollWidth: pagination.scrollWidth, height: pagination.getBoundingClientRect().height } : null,
    filterBar: filterBar ? { clientWidth: filterBar.clientWidth, scrollWidth: filterBar.scrollWidth, overflowX: getComputedStyle(filterBar).overflowX } : null,
    page: { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth },
  };
});
if (result.columns !== 1) throw new Error(`768px 不是單欄：${JSON.stringify(result)}`);
if (result.badgeChecks.some((check) => !check.singleLine || check.height > 48 || (check.scrollWidth > check.clientWidth && check.overflowX === "visible"))) throw new Error(`768px Badge 異常換行或擠壓：${JSON.stringify(result)}`);
if (!result.pagination || result.pagination.scrollWidth > result.pagination.clientWidth + 1) throw new Error(`768px 頁碼列水平溢出：${JSON.stringify(result)}`);
if (!result.filterBar || result.filterBar.overflowX !== "auto") throw new Error(`768px 篩選控制列缺少可控橫向溢出：${JSON.stringify(result)}`);
if (result.page.scrollWidth > result.page.innerWidth + 1) throw new Error(`768px 整頁水平溢出：${JSON.stringify(result)}`);
console.log(JSON.stringify({ width: 768, columns: result.columns, cardCount: result.cardCount, badgeChecks: result.badgeChecks, pagination: result.pagination, filterBar: result.filterBar, page: result.page, passed: true }, null, 2));
await page.close();
await browser.close();
