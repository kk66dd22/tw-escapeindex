import { chromium } from "playwright";
import fs from "node:fs";

const topics = JSON.parse(fs.readFileSync(new URL("../data/topics.json", import.meta.url), "utf8"));
if (topics.length !== 114) throw new Error(`Expected 114 topics, got ${topics.length}`);
const allTags = topics.flatMap((topic) => [...topic.pros, ...topic.cons]);
const uniqueTags = new Set(allTags).size;
if (uniqueTags < 20) throw new Error(`Expected at least 20 unique tags, got ${uniqueTags}`);
if (topics.some((topic) => !topic.tag_provenance || !topic.tag_provenance_note?.includes("不代表玩家實測心得"))) throw new Error("Missing transparent tag provenance");

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
const metrics = await page.locator("article").first().locator("[aria-label$=' / 5']").all();
if (metrics.length < 2) throw new Error(`Expected two score dot groups, got ${metrics.length}`);
for (const metric of metrics) {
  const dots = metric.locator("[aria-hidden='true']");
  if (await dots.count() !== 5) throw new Error("Each score group must contain five dots");
  const box = await dots.first().boundingBox();
  if (!box || box.width < 12 || box.height < 12) throw new Error(`Dot too small: ${JSON.stringify(box)}`);
  const classes = await dots.evaluateAll((nodes) => nodes.map((node) => node.className));
  if (!classes.some((value) => value.includes("shadow-[0_0_8px_#"))) throw new Error("Missing neon shadow class");
}
const overflows = {};
for (const width of [1891, 1280, 768, 375]) {
  await page.setViewportSize({ width, height: width >= 768 ? 900 : 812 });
  await page.reload({ waitUntil: "networkidle" });
  const result = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (result.innerWidth !== result.scrollWidth) throw new Error(`Overflow at ${width}px: ${JSON.stringify(result)}`);
  overflows[width] = result;
}
console.log(JSON.stringify({ topics: topics.length, uniqueTags, totalTags: allTags.length, overflows, dots: metrics.length }, null, 2));
await browser.close();
