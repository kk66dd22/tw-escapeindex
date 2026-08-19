import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const candidates = JSON.parse(await fs.readFile(path.join(root, "data/places_candidates.json"), "utf8"));
const venues = JSON.parse(await fs.readFile(path.join(root, "data/venues.json"), "utf8"));
const topics = JSON.parse(await fs.readFile(path.join(root, "data/topics.json"), "utf8"));
const domain = (url = "") => url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
const normalize = (value = "") => value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
const findMatch = (item) => candidates.find((candidate) => {
  const sameDomain = item.website && candidate.website && domain(item.website) === domain(candidate.website);
  const sameName = normalize(candidate.name).includes(normalize(item.name).slice(0, 6)) || normalize(item.name).includes(normalize(candidate.name).slice(0, 6));
  return sameDomain || sameName;
});
let venueMatches = 0;
for (const venue of venues) {
  const match = findMatch(venue);
  if (!match) continue;
  venue.google_place_id = match.placeId;
  venue.google_review_count = match.reviewCount;
  venue.google_rating_checked_at = match.checkedAt;
  venue.google_rating_scope = "店家／分店級 Google 評價（Places API 代理資料）";
  venue.google_address_verified = match.address;
  venueMatches += 1;
}
let topicMatches = 0;
for (const topic of topics) {
  const match = findMatch({ name: topic.venue_name, website: topic.booking_url });
  if (!match) continue;
  topic.google_place_id = match.placeId;
  topic.google_review_count = match.reviewCount;
  topic.google_rating_checked_at = match.checkedAt;
  topic.google_rating_scope = "店家／分店級 Google 評價（Places API 代理資料）";
  topic.google_address_verified = match.address;
  topicMatches += 1;
}
await fs.writeFile(path.join(root, "data/venues.json"), JSON.stringify(venues, null, 2) + "\n");
await fs.writeFile(path.join(root, "data/topics.json"), JSON.stringify(topics, null, 2) + "\n");
console.log(JSON.stringify({ candidateCount: candidates.length, venueMatches, topicMatches, topicCount: topics.length }, null, 2));
