import fs from "node:fs";

const topics = JSON.parse(fs.readFileSync(new URL("../data/topics.json", import.meta.url), "utf8"));
const home = fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
if (topics.length !== 112) throw new Error(`Expected 112 topics, got ${topics.length}`);
const serialized = JSON.stringify(topics);
for (const forbidden of ["符核對", "符核", "待核對", "依官網為主", "活動活動", "沉浸劇情"]) {
  if (serialized.includes(forbidden) || home.includes(forbidden)) throw new Error(`Forbidden copy remains: ${forbidden}`);
}
for (const label of ["建議人數", "遊戲時間", "恐怖指數", "燒腦程度"]) {
  if (!home.includes(label)) throw new Error(`Missing UI label: ${label}`);
}
const cta = "前往官方預約頁";
if ((home.match(new RegExp(cta, "g")) ?? []).length < 1) throw new Error("CTA copy mismatch");
if (topics.some((topic) => !topic.story_summary || topic.pros.length > 2 || topic.cons.length > 2)) throw new Error("Incomplete localized topic data");
if (topics.some((topic) => topic.duration === "依官網公告" && topic.duration_source !== "請見官方公告")) throw new Error("Unknown duration fallback is not localized consistently");
console.log(JSON.stringify({ topics: topics.length, unknownDurationFallbacks: topics.filter((topic) => topic.duration === "依官網公告").length, uniquePros: new Set(topics.flatMap((topic) => topic.pros)).size, uniqueCons: new Set(topics.flatMap((topic) => topic.cons)).size, forbiddenTerms: 0, cta: true }, null, 2));
