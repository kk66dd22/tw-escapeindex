import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const topicFile = path.join(root, "data/topics.json");
const venueFile = path.join(root, "data/venues.json");

const withReleaseTime = (item) => ({
  ...item,
  release_time: Object.hasOwn(item, "release_time") ? item.release_time : null,
});

const topics = JSON.parse(await fs.readFile(topicFile, "utf8"));
const venues = JSON.parse(await fs.readFile(venueFile, "utf8"));

const nextTopics = topics.map(withReleaseTime);
const nextVenues = venues.map((venue) => ({
  ...venue,
  themes: (venue.themes ?? []).map(withReleaseTime),
}));

await fs.writeFile(topicFile, `${JSON.stringify(nextTopics, null, 2)}\n`, "utf8");
await fs.writeFile(venueFile, `${JSON.stringify(nextVenues, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  topics: nextTopics.length,
  topicsWithReleaseTime: nextTopics.filter((topic) => topic.release_time !== null).length,
  venues: nextVenues.length,
  themes: nextVenues.reduce((total, venue) => total + venue.themes.length, 0),
}, null, 2));
