import { chromium } from "playwright";
const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1891, height: 758 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.locator("#catalog-search").scrollIntoViewIfNeeded();
const report = await page.evaluate(() => {
  const card = document.querySelector("#catalog article");
  const title = card?.querySelector("h3");
  const venue = card?.querySelector("h3")?.previousElementSibling;
  const leaves = ["header", "section.sticky", "#catalog", "footer"].flatMap((selector) => [...document.querySelectorAll(selector)].flatMap((root) => [...root.querySelectorAll("*")])).filter((el) => el.textContent?.trim() && getComputedStyle(el).display !== "none" && el.children.length === 0);
  const rect = card?.getBoundingClientRect();
  return {
    viewport: window.innerWidth,
    cardWidth: card?.clientWidth ?? null,
    cardHeight: rect?.height ?? null,
    titleLines: title ? Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)) : null,
    venueLines: venue ? Math.round(venue.getBoundingClientRect().height / parseFloat(getComputedStyle(venue).lineHeight)) : null,
    minFontSize: Math.min(...leaves.map((el) => parseFloat(getComputedStyle(el).fontSize))),
    pageScrollWidth: document.documentElement.scrollWidth,
  };
});
if (report.minFontSize < 14) throw new Error(`1891px 最小字級不足 14px：${JSON.stringify(report)}`);
if (report.pageScrollWidth > 1891) throw new Error(`1891px 頁面水平溢出：${JSON.stringify(report)}`);
if (!report.cardHeight || report.cardHeight < 470) throw new Error(`1891px 卡片高度異常：${JSON.stringify(report)}`);
console.log(JSON.stringify({ ...report, passed: true }, null, 2));
await browser.close();
