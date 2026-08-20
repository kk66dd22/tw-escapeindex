import { chromium } from "playwright";
const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const results = [];
for (const width of [1280, 375]) {
  const page = await browser.newPage({ viewport: { width, height: 812 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.locator("#catalog").scrollIntoViewIfNeeded();
  const report = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#catalog article")];
    const summaries = cards.map((card) => card.querySelector("h3 + div")?.textContent?.trim() ?? "");
    const first = cards[0];
    const title = first?.querySelector("h3");
    const summary = title?.nextElementSibling;
    const metrics = summary?.nextElementSibling?.nextElementSibling;
    return {
      cardCount: cards.length,
      summaryCount: summaries.filter(Boolean).length,
      summaryLengths: summaries.map((summary) => Array.from(summary).length),
      summaryBetweenTitleAndMetrics: Boolean(title && summary && metrics && summary.className.includes("italic")),
      pageScrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    };
  });
  if (report.cardCount !== 10 || report.summaryCount !== 10 || !report.summaryBetweenTitleAndMetrics || report.pageScrollWidth > width) throw new Error(JSON.stringify(report));
  results.push({ ...report, passed: true });
  await page.close();
}
console.log(JSON.stringify(results, null, 2));
await browser.close();
