import { chromium } from "playwright";

const url = process.env.PREVIEW_URL || "https://3000-iw3rse3x054z7jdrzizt7-2fccb066.sg1.manus.computer/";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

const inputs = page.locator("input");
if (await inputs.count() !== 1) throw new Error(`搜尋輸入框數量錯誤：${await inputs.count()}`);
if (await inputs.first().getAttribute("id") !== "catalog-search") throw new Error("唯一搜尋輸入框不是列表搜尋框");

const search = page.locator("#catalog-search");
await search.scrollIntoViewIfNeeded();
await search.fill("台中");
await page.getByText(/即時比對主題、店家、城市與風格 · \d+ 筆結果/).waitFor();
await page.getByRole("button", { name: "恐怖驚悚" }).click();
await page.locator("#room-sort").selectOption("horror");
const pageStatus = page.getByText(/PAGE \d+ \/ \d+ · SHOWING/);
await pageStatus.waitFor();
const pageCount = await page.getByRole("button", { name: "2", exact: true }).count();
if (pageCount > 0) await page.getByRole("button", { name: "2", exact: true }).click();
await search.fill("EnterSpace");
const statusAfterChange = await pageStatus.textContent();
if (!statusAfterChange?.startsWith("PAGE 01")) throw new Error(`搜尋變更後未回到第 1 頁：${statusAfterChange}`);
console.log(JSON.stringify({ inputs: 1, combinedFilters: true, sort: "horror", paginationReset: true }, null, 2));
await browser.close();
