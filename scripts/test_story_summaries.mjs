import fs from "node:fs";
const topics = JSON.parse(fs.readFileSync(new URL("../data/topics.json", import.meta.url), "utf8"));
const fallback = "此主題以極致的場景打造與沉浸式劇情著稱，是該店不容錯過的指標性神作！";
const invalid = topics.filter((topic) => {
  const length = Array.from(topic.story_summary ?? "").length;
  return !topic.story_summary || length < 30 || length > 50 || !topic.story_summary_provenance || (topic.story_summary_provenance.includes("official") && !(topic.story_summary_source_urls?.length));
});
const official = topics.filter((topic) => topic.story_summary_provenance === "official_page_topic_name_match_editorial_rewrite").length;
const editorial = topics.filter((topic) => topic.story_summary_provenance === "editorial_fallback_inferred_from_theme_metadata").length;
if (topics.length !== 100 || invalid.length || official + editorial !== topics.length || fallback.length === 0) throw new Error(JSON.stringify({ topics: topics.length, invalid: invalid.map((topic) => topic.id), official, editorial }));
console.log(JSON.stringify({ topics: topics.length, official, editorial, minLength: Math.min(...topics.map((topic) => Array.from(topic.story_summary).length)), maxLength: Math.max(...topics.map((topic) => Array.from(topic.story_summary).length)), fallbackAvailable: true, passed: true }, null, 2));
