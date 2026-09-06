import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/topics.json");
const topics = JSON.parse(await fs.readFile(file, "utf8"));
const cleaned = topics.filter((topic) => {
  const match = /^popular-(\d+)$/.exec(topic.id ?? "");
  return !match || Number(match[1]) <= 148;
});
await fs.writeFile(file, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ before: topics.length, after: cleaned.length, removed: topics.length - cleaned.length }, null, 2));
