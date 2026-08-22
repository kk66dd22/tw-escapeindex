import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

const firstCard = page.locator("article[data-topic-id]").first();
const firstId = await firstCard.getAttribute("data-topic-id");
const favoriteButton = firstCard.locator("button[aria-pressed]");
await favoriteButton.click();
if ((await favoriteButton.getAttribute("aria-pressed")) !== "true") throw new Error("收藏按鈕未切換為已收藏");
const stored = await page.evaluate(() => localStorage.getItem("taiwan-escape-favorites:v1"));
if (!firstId || !stored?.includes(firstId)) throw new Error("收藏未寫入 localStorage");

await page.reload({ waitUntil: "networkidle" });
const persistedButton = page.locator(`article[data-topic-id="${firstId}"] button[aria-pressed]`);
if ((await persistedButton.getAttribute("aria-pressed")) !== "true") throw new Error("重新整理後收藏未保留");

await page.locator("#favorites-filter").click();
await page.waitForTimeout(100);
if ((await page.locator("article[data-topic-id]").count()) !== 1) throw new Error("只看收藏未正確過濾");
await page.locator("#favorites-filter").click();

await page.getByRole("button", { name: "2", exact: true }).click();
await page.waitForTimeout(800);
const pageTwoCurrent = await page.getByRole("button", { name: "2", exact: true }).getAttribute("aria-current");
const gridTop = await page.locator("#catalog-grid").evaluate((element) => element.getBoundingClientRect().top);
if (pageTwoCurrent !== "page") throw new Error("頁碼未切換至第 2 頁");
if (gridTop < 64 || gridTop > 190) throw new Error(`分頁後未定位至第一張卡片，gridTop=${gridTop}`);

const scrollClass = await page.locator("[data-tag-scroll]").first().getAttribute("class");
if (!scrollClass?.includes("overflow-x-auto") || !scrollClass.includes("scrollbar-width:thin")) throw new Error("長標籤列缺少 scrollbar 設定");
await page.screenshot({ path: "/home/ubuntu/webdev-static-assets/qa-localized-favorites.png", fullPage: false });

const overflows = {};
for (const width of [1891, 1280, 768, 375]) {
  await page.setViewportSize({ width, height: width >= 768 ? 900 : 812 });
  await page.reload({ waitUntil: "networkidle" });
  const dimensions = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (dimensions.innerWidth !== dimensions.scrollWidth) throw new Error(`${width}px 發生頁面水平溢出：${JSON.stringify(dimensions)}`);
  overflows[width] = dimensions;
}
await page.locator("#catalog-grid").scrollIntoViewIfNeeded();
await page.screenshot({ path: "/home/ubuntu/webdev-static-assets/qa-localized-favorites-mobile.png", fullPage: false });

console.log(JSON.stringify({ favoritePersisted: true, favoriteFilter: true, pageScrollTarget: Math.round(gridTop), tagScrollbar: true, overflows }, null, 2));
await browser.close();
