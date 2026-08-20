import fs from "node:fs";
const topics = JSON.parse(fs.readFileSync(new URL("../data/topics.json", import.meta.url), "utf8"));
const urls = [...new Set(topics.flatMap((topic) => topic.source_urls ?? []))];
const results = [];
for (const url of urls) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { "user-agent": "Taiwan Escape Index research bot/1.0" } });
    const html = await response.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["']/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
    const plain = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    results.push({ url, status: response.status, title: title.slice(0, 240), description: description.slice(0, 500), textSample: plain.slice(0, 1000) });
  } catch (error) {
    results.push({ url, error: String(error) });
  }
}
fs.writeFileSync(new URL("../research/story-source-scan.json", import.meta.url), JSON.stringify({ fetchedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results.map(({ url, status, title, description, error }) => ({ url, status, title, description, error })), null, 2));
