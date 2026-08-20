import fs from "node:fs";
const topics = JSON.parse(fs.readFileSync(new URL("../data/topics.json", import.meta.url), "utf8"));
const venues = [...new Set(topics.map((topic) => topic.venue_name))];
const sourceUrls = [...new Set(topics.flatMap((topic) => topic.source_urls ?? []))];
console.log(JSON.stringify({ count: topics.length, venues, venueCount: venues.length, sourceUrls, missingStory: topics.filter((topic) => !topic.story_summary).map((topic) => ({ id: topic.id, name: topic.name, venue: topic.venue_name, sourceUrls: topic.source_urls ?? [] })) }, null, 2));
