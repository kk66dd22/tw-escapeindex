import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "research/places-topic-audit.json");
const audit = JSON.parse(await fs.readFile(file, "utf8"));

const additions = [
  {
    placeId: "curated-zhenming-taichung",
    candidateName: "鎮冥工作室",
    region: "台中",
    rating: null,
    reviewCount: null,
    website: "https://www.instagram.com/sangeng.escaqe/",
    officialPageChecked: true,
    expandedTopicCount: 1,
    matchedTopicIds: ["popular-115"],
    status: "已核對並部分展開",
    checkedAt: "2026-09-06",
    sourceUrls: ["https://escape.bar/game/26477", "https://escape.bar/firm/26465", "https://www.instagram.com/sangeng.escaqe/"],
  },
  {
    placeId: "curated-baishida-taichung",
    candidateName: "百室達密室脫逃",
    region: "台中",
    rating: null,
    reviewCount: null,
    website: "https://baishidaescape.simplybook.asia/v2/",
    officialPageChecked: true,
    expandedTopicCount: 1,
    matchedTopicIds: ["popular-116"],
    status: "已核對並部分展開",
    checkedAt: "2026-09-06",
    sourceUrls: ["https://escape.bar/game/26907", "https://escape.bar/firm/26898", "https://www.instagram.com/baishida_escape/", "https://baishidaescape.simplybook.asia/v2/"],
  },
  {
    placeId: "curated-shanli-taichung",
    candidateName: "山裏工作室",
    region: "台中",
    rating: null,
    reviewCount: null,
    website: "https://www.instagram.com/mountain111_escape/",
    officialPageChecked: true,
    expandedTopicCount: 1,
    matchedTopicIds: ["popular-117"],
    status: "已核對並部分展開",
    checkedAt: "2026-09-06",
    sourceUrls: ["https://escape.bar/game/26864", "https://www.instagram.com/mountain111_escape/"],
  },
  {
    placeId: "curated-merlins-beard-yilan",
    candidateName: "梅林的鬍子遊戲工作室",
    region: "宜蘭",
    rating: null,
    reviewCount: null,
    website: "https://www.yilanmerlinsbeard.com/",
    officialPageChecked: true,
    expandedTopicCount: 5,
    matchedTopicIds: ["popular-118", "popular-119", "popular-120", "popular-121", "popular-122"],
    status: "已核對並部分展開",
    checkedAt: "2026-09-06",
    sourceUrls: ["https://www.yilanmerlinsbeard.com/", "https://beardyilan.com/alley/", "https://beardyilan.com/ghostmarriage/", "https://beardyilan.com/flower/", "https://beardyilan.com/sword/"],
  },
  {
    placeId: "curated-kuaitaoa-taoyuan",
    candidateName: "塊陶阿工作室（中壢店）",
    region: "桃園",
    rating: null,
    reviewCount: null,
    website: "https://www.kuaitaoa.cc/",
    officialPageChecked: true,
    expandedTopicCount: 1,
    matchedTopicIds: ["popular-123"],
    status: "已核對並部分展開",
    checkedAt: "2026-09-06",
    sourceUrls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/荒村小學/"],
  },
  {
    placeId: "curated-kuaitaoa-taipei-qingguang",
    candidateName: "塊陶阿工作室（晴光店）",
    region: "雙北",
    rating: null,
    reviewCount: null,
    website: "https://www.kuaitaoa.cc/",
    officialPageChecked: true,
    expandedTopicCount: 1,
    matchedTopicIds: ["popular-124"],
    status: "已核對並部分展開",
    checkedAt: "2026-09-06",
    sourceUrls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/見鬼十法/"],
  },
];

const byId = new Map(audit.map((entry) => [entry.placeId, entry]));
for (const entry of additions) byId.set(entry.placeId, entry);
await fs.writeFile(file, `${JSON.stringify([...byId.values()], null, 2)}\n`, "utf8");
console.log(JSON.stringify({ before: audit.length, candidates: additions.length, after: byId.size }, null, 2));
