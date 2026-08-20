import fs from "node:fs";
const topics = JSON.parse(fs.readFileSync(new URL("../data/topics.json", import.meta.url), "utf8"));
const scan = JSON.parse(fs.readFileSync(new URL("../research/story-source-scan.json", import.meta.url), "utf8"));
const matches = topics.map((topic) => {
  const found = scan.results.find((result) => {
    const haystack = `${result.title ?? ""} ${result.description ?? ""} ${result.textSample ?? ""}`;
    return (topic.source_urls ?? []).includes(result.url) && haystack.includes(topic.name);
  });
  return { id: topic.id, name: topic.name, match: found?.url ?? null };
});
console.log(JSON.stringify({ matched: matches.filter((item) => item.match).length, unmatched: matches.filter((item) => !item.match).length, matches: matches.filter((item) => item.match) }, null, 2));
