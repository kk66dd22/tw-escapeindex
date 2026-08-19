import { chromium } from "playwright";
const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
const result = await page.evaluate(() => {
  const all = [...document.querySelectorAll("body *")];
  return all.map((el) => ({ tag: el.tagName, className: el.className?.toString?.() ?? "", width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, text: (el.textContent ?? "").trim().slice(0, 60) })).filter((x) => x.right > window.innerWidth + 1).sort((a, b) => b.right - a.right).slice(0, 20);
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
