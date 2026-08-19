import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const baseUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
const key = process.env.BUILT_IN_FORGE_API_KEY;
if (!baseUrl || !key) throw new Error("Built-in Maps proxy environment is unavailable");

const regions = [
  ["雙北", "台北市 密室逃脫"], ["雙北", "新北市 密室逃脫"],
  ["台中", "台中市 密室逃脫"], ["南台灣", "台南市 密室逃脫"],
  ["南台灣", "高雄市 密室逃脫"],
];

async function request(endpoint, params) {
  const url = new URL(`${baseUrl}/v1/maps/proxy${endpoint}`);
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Places proxy ${response.status}`);
  return response.json();
}

const byPlaceId = new Map();
for (const [region, query] of regions) {
  const search = await request("/maps/api/place/textsearch/json", { query, language: "zh-TW", region: "tw" });
  for (const place of search.results ?? []) {
    if (!place.place_id || !place.name || byPlaceId.has(place.place_id)) continue;
    let details = null;
    try {
      details = await request("/maps/api/place/details/json", {
        place_id: place.place_id,
        fields: "place_id,name,formatted_address,website,rating,user_ratings_total,business_status",
        language: "zh-TW",
      });
    } catch {
      // Keep the Text Search result when a details call is unavailable.
    }
    const result = details?.result ?? place;
    if (typeof result.rating !== "number" || result.rating < 4.5) continue;
    byPlaceId.set(place.place_id, {
      placeId: place.place_id,
      region,
      name: result.name,
      address: result.formatted_address,
      rating: result.rating,
      reviewCount: result.user_ratings_total ?? 0,
      businessStatus: result.business_status ?? null,
      website: result.website ?? null,
      source: "Google Places API via Manus Maps proxy",
      checkedAt: new Date().toISOString(),
    });
  }
}

const candidates = [...byPlaceId.values()].sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
await fs.writeFile(path.join(root, "data", "places_candidates.json"), JSON.stringify(candidates, null, 2) + "\n");
console.log(JSON.stringify({ total: candidates.length, regions: Object.groupBy(candidates, (item) => item.region) }, null, 2));
