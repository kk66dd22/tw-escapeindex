import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/venues.json");
const venues = JSON.parse(await fs.readFile(file, "utf8"));

const venue = ({ id, name, city, region, district, address, website, themes, source_urls, note }) => ({
  id,
  name,
  city,
  region,
  district,
  address,
  website,
  booking_url: website,
  google_rating: null,
  rating_source: "尚未採用未核實的數字評價",
  rating_checked_at: "2026-09-06",
  rating_note: note,
  themes,
  pros: ["官方主題資料可查", "主題玩法與城市分類已整理"],
  cons: ["熱門時段建議提早確認", "正式預約前請以店家最新公告為準"],
  source_urls,
  last_source_fetch: "2026-09-06",
  google_rating_scope: "未採用數字評價",
});

const additions = [
  venue({
    id: "zhenming-taichung",
    name: "鎮冥工作室",
    city: "台中市",
    region: "中部",
    district: "大里區",
    address: "台中市大里區國光路二段500號12樓（以官方最新預約資訊為準）",
    website: "https://www.instagram.com/sangeng.escaqe/",
    themes: [{ name: "三更", players: "6–8", horror: 5, brain: 3, styles: ["恐怖驚悚", "沉浸式演繹", "追逐體驗"] }],
    source_urls: ["https://escape.bar/game/26477", "https://escape.bar/firm/26465", "https://www.instagram.com/sangeng.escaqe/"],
    note: "官方社群與公開主題頁交叉核對；未填入店家數字評價。",
  }),
  venue({
    id: "baishida-taichung",
    name: "百室達密室脫逃",
    city: "台中市",
    region: "中部",
    district: "大里區",
    address: "台中市大里區國光路二段500號11樓之2（以官方最新預約資訊為準）",
    website: "https://baishidaescape.simplybook.asia/v2/",
    themes: [{ name: "誕生", players: "4–8", horror: 4, brain: 3, styles: ["恐怖驚悚", "泰式恐怖", "沉浸式演繹", "追逐體驗"] }],
    source_urls: ["https://escape.bar/game/26907", "https://escape.bar/firm/26898", "https://www.instagram.com/baishida_escape/", "https://baishidaescape.simplybook.asia/v2/"],
    note: "公開主題頁、官方社群與預約平台交叉核對；預約頁需以最新場次為準。",
  }),
  venue({
    id: "shanli-taichung",
    name: "山裏工作室",
    city: "台中市",
    region: "中部",
    district: "太平區",
    address: "台中市太平區（以官方最新預約資訊為準）",
    website: "https://www.instagram.com/mountain111_escape/",
    themes: [{ name: "鬼不語", players: "3–6", horror: 5, brain: 4, styles: ["恐怖驚悚", "沉浸式演繹", "高難度解謎", "單線任務"] }],
    source_urls: ["https://escape.bar/game/26864", "https://www.instagram.com/mountain111_escape/"],
    note: "官方社群與公開主題頁交叉核對；地址詳細度以店家最新公告為準。",
  }),
  venue({
    id: "merlins-beard-yilan",
    name: "梅林的鬍子遊戲工作室",
    city: "宜蘭市",
    region: "東部",
    district: "本館／二館",
    address: "本館：宜蘭市康樂路61號；二館：宜蘭市昇平街24號2樓",
    website: "https://www.yilanmerlinsbeard.com/",
    themes: [
      { name: "LINA", players: "4–6", horror: 3, brain: 4, styles: ["歐美風格", "微恐懸疑", "沉浸式演繹"] },
      { name: "巷仔口", players: "4–6", horror: 2, brain: 3, styles: ["民國懷舊", "懸疑推理", "機關解謎"] },
      { name: "陰緣", players: "4–8", horror: 4, brain: 3, styles: ["恐怖驚悚", "台灣民俗", "角色扮演"] },
      { name: "花見小路", players: "3–5", horror: 1, brain: 3, styles: ["日式風格", "新手小品", "解謎探索"] },
      { name: "聖劍騎士", players: "6–10", horror: 1, brain: 3, styles: ["奇幻冒險", "角色扮演", "多人協作"] },
    ],
    source_urls: ["https://www.yilanmerlinsbeard.com/", "https://beardyilan.com/alley/", "https://beardyilan.com/ghostmarriage/", "https://beardyilan.com/flower/", "https://beardyilan.com/sword/"],
    note: "官方網站確認本館／二館與五款原創主題；未填入未即時核實的店家數字評價。",
  }),
  venue({
    id: "kuaitaoa-taoyuan",
    name: "塊陶阿工作室",
    city: "桃園市",
    region: "北部",
    district: "中壢店",
    address: "桃園市中壢區環中東路二段516號6樓",
    website: "https://www.kuaitaoa.cc/",
    themes: [{ name: "荒村小學", players: "4–9", horror: 4, brain: 3, styles: ["校園怪談", "驚悚恐怖", "NPC互動"] }],
    source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/荒村小學/"],
    note: "官方網站明確列為桃園中壢店主題；見鬼十法屬台北晴光店，不歸入桃園。",
  }),
  venue({
    id: "kuaitaoa-taipei-qingguang",
    name: "塊陶阿工作室",
    city: "台北市",
    region: "北部",
    district: "晴光店｜中山",
    address: "台北市中山區新生北路三段82巷37號地下一樓",
    website: "https://www.kuaitaoa.cc/",
    themes: [{ name: "見鬼十法", players: "4–8", horror: 4, brain: 3, styles: ["試膽體驗", "驚悚恐怖", "NPC互動"] }],
    source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/見鬼十法/"],
    note: "官方網站明確列為台北晴光店主題，未誤分類到桃園。",
  }),
];

const existing = new Set(venues.map((item) => `${item.name}::${item.city}::${item.district}`));
const next = [...venues];
for (const item of additions) {
  const key = `${item.name}::${item.city}::${item.district}`;
  if (!existing.has(key)) {
    next.push(item);
    existing.add(key);
  }
}

await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ before: venues.length, candidates: additions.length, after: next.length, added: next.length - venues.length }, null, 2));
