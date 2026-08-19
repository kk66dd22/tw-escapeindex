import { chromium } from "playwright";
const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.locator("#catalog-search").scrollIntoViewIfNeeded();
const result = await page.evaluate(() => [...document.querySelectorAll("#catalog article")].slice(0, 3).map((card, index) => ({
  index,
  width: card.clientWidth,
  scrollWidth: card.scrollWidth,
  overflowing: [...card.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1).slice(0, 8).map((el) => ({ tag: el.tagName, className: el.className, text: el.textContent?.trim().slice(0, 80), width: el.clientWidth, scrollWidth: el.scrollWidth }))
})));
console.log(JSON.stringify(result, null, 2));
await browser.close();
