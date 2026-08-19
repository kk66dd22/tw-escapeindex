import { chromium } from "playwright";
const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1891, height: 758 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.locator("#catalog-search").scrollIntoViewIfNeeded();
const report = await page.evaluate(() => {
  const leaves = ["header", "section.sticky", "#catalog", "footer"].flatMap((selector) => [...document.querySelectorAll(selector)].flatMap((root) => [...root.querySelectorAll("*")])).filter((el) => el.textContent?.trim() && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && el.children.length === 0);
  const card = document.querySelector("#catalog article");
  const venue = card?.querySelector("h3")?.previousElementSibling;
  const sort = document.querySelector("#room-sort");
  return {
    viewport: window.innerWidth,
    minFontSize: Math.min(...leaves.map((el) => parseFloat(getComputedStyle(el).fontSize))),
    sortFontSize: sort ? parseFloat(getComputedStyle(sort).fontSize) : null,
    venueFontSize: venue ? parseFloat(getComputedStyle(venue).fontSize) : null,
    cardWidth: card?.clientWidth ?? null,
    pageScrollWidth: document.documentElement.scrollWidth,
  };
});
if (report.minFontSize < 14 || report.sortFontSize !== 14 || report.venueFontSize !== 14) throw new Error(`1891px 字級不符合桌機 14px：${JSON.stringify(report)}`);
if (report.pageScrollWidth > 1891) throw new Error(`1891px 頁面水平溢出：${JSON.stringify(report)}`);
console.log(JSON.stringify({ ...report, passed: true }, null, 2));
await browser.close();
