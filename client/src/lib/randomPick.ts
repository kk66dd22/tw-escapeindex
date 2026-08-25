/** 從候選清單中挑選一筆；可注入亂數函式以利測試。 */
export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | null {
  if (items.length === 0) return null;

  const index = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)));
  return items[index] ?? null;
}

/** 找出候選項目位於哪一個一索引分頁；查無項目時回傳 null。 */
export function pageForItem<T>(items: readonly T[], item: T, pageSize: number): number | null {
  if (pageSize <= 0) return null;

  const index = items.indexOf(item);
  return index === -1 ? null : Math.floor(index / pageSize) + 1;
}
