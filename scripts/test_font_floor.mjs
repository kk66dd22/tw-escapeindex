import { chromium } from "playwright";

const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const results = [];
for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.locator("#catalog-search").scrollIntoViewIfNeeded();
  const report = await page.evaluate(() => {
    const roots = ["header", "section.sticky", "#catalog", "footer"];
    const leaves = roots.flatMap((selector) => Array.from(document.querySelectorAll(selector))).flatMap((root) => Array.from(root.querySelectorAll("*"))).filter((element) => {
      const text = element.textContent?.trim();
      const style = getComputedStyle(element);
      return Boolean(text) && style.display !== "none" && style.visibility !== "hidden" && element.children.length === 0;
    });
    const fontSizes = leaves.map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    const minFontSize = Math.min(...fontSizes);
    const controls = ["#catalog-search", "#room-sort", "#catalog article", "#catalog footer"].map(() => null);
    const cards = Array.from(document.querySelectorAll("#catalog article")).map((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
    const pageControls = document.querySelector("#catalog .mt-10");
    return {
      minFontSize,
      searchFontSize: Number.parseFloat(getComputedStyle(document.querySelector("#catalog-search")).fontSize),
      sortFontSize: Number.parseFloat(getComputedStyle(document.querySelector("#room-sort")).fontSize),
      cards,
      pageControlsHeight: pageControls ? pageControls.getBoundingClientRect().height : 0,
      pageControlsOverflow: pageControls ? pageControls.scrollWidth > pageControls.clientWidth + 1 : false,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  if (report.minFontSize < 12 || report.searchFontSize < 12 || report.sortFontSize < 12) throw new Error(`${viewport.width}px 最小字級不足 12px: ${JSON.stringify(report)}`);
  if (report.cards.some((card) => card.scrollWidth > card.width + 1)) throw new Error(`${viewport.width}px 卡片內容水平溢出`);
  if (report.pageOverflow) throw new Error(`${viewport.width}px 頁面水平溢出`);
  results.push({ width: viewport.width, minFontSize: report.minFontSize, searchFontSize: report.searchFontSize, sortFontSize: report.sortFontSize, pageControlsHeight: report.pageControlsHeight, pageControlsOverflow: report.pageControlsOverflow, pageOverflow: report.pageOverflow });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
