import fs from "node:fs";

const topicsPath = new URL("../data/topics.json", import.meta.url);
const venuesPath = new URL("../data/venues.json", import.meta.url);

const allowedPros = [
  "沉浸式場景神還原",
  "全機關老手大推",
  "劇情反轉超燒腦",
  "機關控必玩神作",
  "新手推坑首選",
  "小團2人即可開始",
  "NPC互動極具張力",
  "場景細節控必玩",
];

const allowedCons = [
  "熱門時段較難預約",
  "部分謎題較困難",
  "空間稍微較擁擠",
  "極度消耗體力",
  "新手容易卡關",
  "老手可能會覺得偏簡單",
  "語音提示不清晰",
  "極度考驗腦力",
];

function normalizeText(value) {
  return value
    .replaceAll("符核對", "依官網公告")
    .replaceAll("符核", "依官網公告")
    .replaceAll("待核對", "依官網公告")
    .replaceAll("依官網為主", "依官網公告")
    .replaceAll("跨店家比較資訊完整", "跨店家資訊比對完整度高")
    .replaceAll("活動活動活動檔期", "活動檔期")
    .replaceAll("活動活動檔期", "活動檔期")
    .replaceAll("活動活動", "活動")
    .replaceAll("沉浸劇情", "沉浸式劇情");
}

function normalizeTree(value) {
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) return value.map(normalizeTree);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeTree(item)]));
  }
  return value;
}

function playerRange(players) {
  const values = String(players).match(/\d+/g)?.map(Number) ?? [];
  return {
    min: values[0] ?? null,
    max: values.at(-1) ?? null,
  };
}

function selectPros(topic) {
  const styles = topic.styles.join("、");
  const { min } = playerRange(topic.players);
  const candidates = [];

  if (styles.includes("真人互動")) candidates.push("NPC互動極具張力");
  if (styles.includes("機關")) candidates.push((topic.brain ?? 0) >= 4 ? "全機關老手大推" : "機關控必玩神作");
  if (styles.includes("沉浸式劇情") || styles.includes("恐怖驚悚")) candidates.push("沉浸式場景神還原");
  if ((topic.brain ?? 0) >= 4) candidates.push("劇情反轉超燒腦");
  if ((topic.brain ?? 5) <= 3 && (topic.horror ?? 5) <= 2) candidates.push("新手推坑首選");
  if (min !== null && min <= 2) candidates.push("小團2人即可開始");
  if (["場景探索", "日系解謎", "奇幻", "科幻"].some((style) => styles.includes(style))) candidates.push("場景細節控必玩");

  const unique = [...new Set(candidates)].filter((tag) => allowedPros.includes(tag));
  return unique.slice(0, 2);
}

function selectCons(topic) {
  const styles = topic.styles.join("、");
  const { min, max } = playerRange(topic.players);
  const candidates = [];

  if ((topic.google_review_count ?? 0) >= 1000) candidates.push("熱門時段較難預約");
  if ((topic.brain ?? 0) >= 4) candidates.push("部分謎題較困難");
  if ((topic.brain ?? 0) >= 5) candidates.push("極度考驗腦力");
  else if ((topic.brain ?? 5) <= 2) candidates.push("老手可能會覺得偏簡單");
  if ((topic.brain ?? 0) >= 4 && min !== null && min <= 4) candidates.push("新手容易卡關");
  if (["體力", "追逐", "動作"].some((style) => styles.includes(style))) candidates.push("極度消耗體力");
  if (styles.includes("語音")) candidates.push("語音提示不清晰");
  if (max !== null && max >= 10 && styles.includes("真人互動")) candidates.push("空間稍微較擁擠");

  const unique = [...new Set(candidates)].filter((tag) => allowedCons.includes(tag));
  return unique.slice(0, 2);
}

const topics = normalizeTree(JSON.parse(fs.readFileSync(topicsPath, "utf8"))).map((topic) => ({
  ...topic,
  players: /\d/.test(topic.players) ? topic.players : "依官網公告",
  duration: /\d/.test(topic.duration) ? topic.duration : "依官網公告",
  duration_source: /\d/.test(topic.duration) ? topic.duration_source : "請見官方公告",
  styles: topic.styles.map(normalizeText),
  pros: selectPros(topic),
  cons: selectCons(topic),
  tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
  tag_provenance_note: "優缺點依公開主題屬性、編輯部導覽分級與店家評價資料配對；未引用或捏造 Dcard、PTT 玩家發言。",
  story_summary_note: "此為編輯部導覽短評，非官方逐字文案；人數、時間與場次資訊依官網公告。",
}));

const venues = normalizeTree(JSON.parse(fs.readFileSync(venuesPath, "utf8")));

fs.writeFileSync(topicsPath, `${JSON.stringify(topics, null, 2)}\n`);
fs.writeFileSync(venuesPath, `${JSON.stringify(venues, null, 2)}\n`);

const allText = JSON.stringify({ topics, venues });
console.log(JSON.stringify({
  topics: topics.length,
  allowedPros: allowedPros.length,
  allowedCons: allowedCons.length,
  topicsWithOnePro: topics.filter((topic) => topic.pros.length === 1).length,
  topicsWithTwoPros: topics.filter((topic) => topic.pros.length === 2).length,
  topicsWithNoCons: topics.filter((topic) => topic.cons.length === 0).length,
  topicsWithOneCon: topics.filter((topic) => topic.cons.length === 1).length,
  topicsWithTwoCons: topics.filter((topic) => topic.cons.length === 2).length,
  forbiddenTermsRemaining: ["符核對", "符核", "待核對", "依官網為主", "活動活動", "沉浸劇情"].filter((term) => allText.includes(term)),
}, null, 2));
