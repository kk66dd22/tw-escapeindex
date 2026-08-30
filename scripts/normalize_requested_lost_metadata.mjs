import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/topics.json");
const topics = JSON.parse(await fs.readFile(file, "utf8"));
const targets = new Set([
  "LOST Taiwan（台北忠孝店）::星靈",
  "LOST Taiwan（台北忠孝店）::所羅門之鑰",
  "LOST Taiwan（台北站前店）::巴貝時空工作室",
  "LOST Taiwan（台北站前店）::復活節島",
]);

let updated = 0;
const next = topics.map((topic) => {
  if (!targets.has(`${topic.venue_name}::${topic.name}`)) return topic;
  updated += 1;
  return {
    ...topic,
    google_rating: null,
    google_place_id: null,
    google_review_count: null,
    google_rating_checked_at: null,
    google_rating_scope: "未逐店核對；請見官方公告",
    rating_scope: "未逐店核對；請見官方公告",
    data_quality: "user_requested_catalog_addition_official_branch_reference",
  };
});

if (updated !== targets.size) {
  throw new Error(`Expected ${targets.size} LOST Taiwan records, found ${updated}`);
}

await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
console.log(JSON.stringify({ updated }, null, 2));
