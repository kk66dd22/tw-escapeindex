import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/topics.json");
const topics = JSON.parse(await fs.readFile(file, "utf8"));
for (const topic of topics) {
  const addedByPlacesExpansion = Number(topic.id.replace("popular-", "")) > 55;
  topic.data_quality = addedByPlacesExpansion ? "official_theme_page_plus_venue_proxy" : "verified_catalog";
  topic.duration_source = topic.duration === "待核對" ? "待官方主題頁核對" : "官方主題頁";
  topic.editorial_scale_scope = "編輯部導覽分級；非官方難度或玩家評分";
}
await fs.writeFile(file, JSON.stringify(topics, null, 2) + "\n");
console.log(JSON.stringify({ total: topics.length, addedExpansion: topics.filter((x) => x.data_quality === "official_theme_page_plus_venue_proxy").length, durationVerified: topics.filter((x) => x.duration !== "待核對").length, durationPending: topics.filter((x) => x.duration === "待核對").length }, null, 2));
