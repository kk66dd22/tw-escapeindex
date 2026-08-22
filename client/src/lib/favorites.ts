export const FAVORITES_STORAGE_KEY = "taiwan-escape-favorites:v1";

export function parseFavoriteIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function toggleFavoriteId(current: Set<string>, topicId: string): Set<string> {
  const next = new Set(current);
  if (next.has(topicId)) next.delete(topicId);
  else next.add(topicId);
  return next;
}

export function serializeFavoriteIds(ids: Set<string>): string {
  return JSON.stringify(Array.from(ids).sort());
}
