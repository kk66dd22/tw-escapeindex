import { chromium } from "playwright";
const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
const reports = [];
for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
  if (pageNumber > 1) await page.getByRole("button", { name: String(pageNumber), exact: true }).click();
  await page.locator("#catalog article").first().waitFor();
  const report = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#catalog article")];
    const summaries = cards.map((card) => card.querySelector("h3 + div")?.textContent?.replace(/^✦/, "").trim() ?? "");
    return {
      cardCount: cards.length,
      summaryCount: summaries.filter(Boolean).length,
      summaryLengths: summaries.map((summary) => Array.from(summary).length),
      pageScrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    };
  });
  if (report.cardCount !== 10 || report.summaryCount !== 10 || report.summaryLengths.some((length) => length < 30 || length > 50) || report.pageScrollWidth > report.viewport) throw new Error(JSON.stringify({ pageNumber, ...report }));
  reports.push({ page: pageNumber, ...report, passed: true });
}
console.log(JSON.stringify({ pages: reports.length, cards: reports.reduce((sum, report) => sum + report.cardCount, 0), reports }, null, 2));
await browser.close();
