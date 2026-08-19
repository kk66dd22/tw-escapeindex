import { chromium } from "playwright";

const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 812 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  const search = page.locator("#catalog-search");
  await search.scrollIntoViewIfNeeded();
  await search.fill("台中");
  await page.getByText(/即時比對主題、店家、城市與風格 · \d+ 筆結果/).waitFor();
  const resultText = await page.locator("#catalog").getByText(/即時比對主題、店家、城市與風格 ·/).textContent();
  if (!resultText || !/· [1-9]\d* 筆結果/.test(resultText)) throw new Error(`搜尋沒有產生結果：${resultText}`);
  if (await page.getByRole("button", { name: "清除關鍵字" }).count() !== 1) throw new Error("清除關鍵字按鈕未出現");
  await page.getByRole("button", { name: "清除關鍵字" }).click();
  if ((await search.inputValue()) !== "") throw new Error("清除關鍵字未清空搜尋框");
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  if (overflow.scrollWidth > overflow.innerWidth + 1) throw new Error(`搜尋版面水平溢出：${overflow.scrollWidth} > ${overflow.innerWidth}`);
  await page.close();
}
console.log(JSON.stringify({ viewports: 2, query: "台中", clearButton: true, mobileOverflow: "checked" }, null, 2));
await browser.close();
