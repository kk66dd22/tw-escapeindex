import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const candidates = JSON.parse(await fs.readFile(path.join(root, "data/places_candidates.json"), "utf8"));
const topics = JSON.parse(await fs.readFile(path.join(root, "data/topics.json"), "utf8"));
const normalize = (value = "") => value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
const domain = (url = "") => url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
const verifiedDomains = new Set(["funlockstudio.com", "missgame.com.tw", "dream94zz.com", "mystotoescape.com", "througher.com.tw", "loginescape.com", "escer.com.tw", "enterspace.tw"]);
const audit = candidates.map((candidate) => {
  const candidateName = normalize(candidate.name);
  const candidateDomain = domain(candidate.website);
  const matchedTopics = topics.filter((topic) => {
    const topicText = normalize(`${topic.venue_name} ${topic.name}`);
    return topicText.includes(candidateName.slice(0, 5)) || candidateName.includes(normalize(topic.venue_name).slice(0, 5)) || domain(topic.booking_url) === candidateDomain;
  });
  const officialPageChecked = verifiedDomains.has(candidateDomain);
  return {
    placeId: candidate.placeId,
    candidateName: candidate.name,
    region: candidate.region,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    website: candidate.website,
    officialPageChecked,
    expandedTopicCount: matchedTopics.length,
    matchedTopicIds: matchedTopics.map((topic) => topic.id),
    status: officialPageChecked && matchedTopics.length > 0 ? "已核對並部分展開" : officialPageChecked ? "已核對但尚未展開" : "待官方頁核對",
    checkedAt: officialPageChecked ? "2026-08-19" : null,
  };
});
await fs.writeFile(path.join(root, "research", "places-topic-audit.json"), JSON.stringify(audit, null, 2) + "\n");
const summary = { total: audit.length, officialPageChecked: audit.filter((x) => x.officialPageChecked).length, expanded: audit.filter((x) => x.expandedTopicCount > 0).length, pending: audit.filter((x) => !x.officialPageChecked).length };
console.log(JSON.stringify(summary, null, 2));
