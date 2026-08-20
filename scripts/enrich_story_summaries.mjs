import fs from "node:fs";
const dataPath = new URL("../data/topics.json", import.meta.url);
const scanPath = new URL("../research/story-source-scan.json", import.meta.url);
const topics = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const scan = JSON.parse(fs.readFileSync(scanPath, "utf8"));
const scanByUrl = new Map(scan.results.map((result) => [result.url, result]));
const clean = (value) => value.replace(/\s+/g, " ").trim();
const makeSummary = (topic) => {
  const name = topic.name;
  const style = topic.styles?.[0] ?? "沉浸探索";
  const second = topic.styles?.[1] ?? "劇情解謎";
  let summary;
  if (topic.horror >= 4) {
    summary = `《${name}》的禁忌線索從未消失，你們循著${style}深入黑暗；當${second}異象逼近，唯有解開謎局，才能帶著真相離開。`;
  } else if (topic.horror >= 2) {
    summary = `踏入《${name}》，未說完的秘密正等你們追查；沿著${style}線索，在${second}與未知之間找出出口。`;
  } else {
    summary = `《${name}》邀你們踏上${style}冒險；循著${second}留下的線索協力前進，揭開被藏起來的真相。`;
  }
  return Array.from(summary).length > 50 ? `${Array.from(summary).slice(0, 49).join("")}…` : summary;
};
const findOfficialEvidence = (topic) => {
  for (const url of topic.source_urls ?? []) {
    const result = scanByUrl.get(url);
    if (!result) continue;
    const haystack = clean(`${result.title ?? ""} ${result.description ?? ""} ${result.textSample ?? ""}`);
    const position = haystack.indexOf(topic.name);
    if (position >= 0) return { url, excerpt: haystack.slice(Math.max(0, position - 120), position + topic.name.length + 220) };
  }
  return null;
};
const enriched = topics.map((topic) => {
  const evidence = findOfficialEvidence(topic);
  return {
    ...topic,
    story_summary: makeSummary(topic),
    story_summary_provenance: evidence
      ? "official_page_topic_name_match_editorial_rewrite"
      : "editorial_fallback_inferred_from_theme_metadata",
    story_summary_source_urls: evidence ? [evidence.url] : [],
    story_summary_source_excerpt: evidence?.excerpt ?? null,
    story_summary_note: evidence
      ? "官方頁面可定位主題名稱，但未取得完整主題級劇情段落；摘要為編輯部根據主題名稱與導覽 metadata 重寫，非官方逐字引用。"
      : "未找到可核對的主題級官方劇情；此為依主題名稱與 metadata 撰寫的編輯部導覽短評，非官方文案。",
  };
});
fs.writeFileSync(dataPath, `${JSON.stringify(enriched, null, 2)}\n`);
const stats = {
  count: enriched.length,
  officialPageNameMatch: enriched.filter((topic) => topic.story_summary_provenance === "official_page_topic_name_match_editorial_rewrite").length,
  editorialFallback: enriched.filter((topic) => topic.story_summary_provenance === "editorial_fallback_inferred_from_theme_metadata").length,
  minLength: Math.min(...enriched.map((topic) => topic.story_summary.length)),
  maxLength: Math.max(...enriched.map((topic) => topic.story_summary.length)),
};
console.log(JSON.stringify(stats, null, 2));
