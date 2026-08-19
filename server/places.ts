import { makeRequest, type PlacesSearchResult, type PlaceDetailsResult } from "./_core/map";

export type PlaceCandidate = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number;
  businessStatus: string | null;
  website: string | null;
  source: "google_places_proxy";
  checkedAt: string;
};

export async function searchEscapeVenues(query: string): Promise<PlaceCandidate[]> {
  const result = await makeRequest<PlacesSearchResult>("/maps/api/place/textsearch/json", {
    query: `${query} 密室逃脫 台灣`,
    language: "zh-TW",
    region: "tw",
  });

  if (result.status !== "OK" && result.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places returned status ${result.status}`);
  }

  const candidates = (result.results ?? []).filter((place) => place.place_id && place.name).slice(0, 20);
  const detailed = await Promise.all(candidates.map(async (place) => {
    try {
      const details = await makeRequest<PlaceDetailsResult>("/maps/api/place/details/json", {
        place_id: place.place_id,
        fields: "place_id,name,formatted_address,website,rating,user_ratings_total,business_status",
        language: "zh-TW",
      });
      const item = details.result;
      return {
        placeId: item.place_id,
        name: item.name,
        address: item.formatted_address,
        rating: item.rating ?? null,
        reviewCount: item.user_ratings_total ?? 0,
        businessStatus: null,
        website: item.website ?? null,
        source: "google_places_proxy" as const,
        checkedAt: new Date().toISOString(),
      } satisfies PlaceCandidate;
    } catch {
      return {
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating ?? null,
        reviewCount: place.user_ratings_total ?? 0,
        businessStatus: place.business_status ?? null,
        website: null,
        source: "google_places_proxy" as const,
        checkedAt: new Date().toISOString(),
      } satisfies PlaceCandidate;
    }
  }));

  return detailed.filter((place) => place.rating !== null && place.rating >= 4.5);
}
