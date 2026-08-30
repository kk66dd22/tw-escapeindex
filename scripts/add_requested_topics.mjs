import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/topics.json");
const topics = JSON.parse(await fs.readFile(file, "utf8"));

const shared = {
  rating_scope: "店家／分店級 Google 評價（代理門檻）",
  duration_source: "請見官方公告",
  editorial_scale_scope: "編輯部導覽分級；非官方難度或玩家評分",
  story_summary_provenance: "editorial_navigation_copy_based_on_existing_metadata",
  story_summary_note: "此為導覽摘要，僅依既有主題分類與編輯資料整理；人數、時間與場次依官網公告。",
  story_summary_source_excerpt: null,
  tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
  tag_provenance_note: "標籤僅作為導覽提示，依既有主題分類與編輯資料整理；不代表玩家實測心得或官方承諾。",
  pros: [],
  cons: [],
  styles: [],
  players: "依官網公告",
  duration: "依官網公告",
  horror: null,
  brain: null,
};

const sources = {
  head: {
    venue_name: "頭癮創意遊戲（西門店）",
    city: "台北市",
    district: "萬華",
    google_rating: 4.9,
    google_place_id: "ChIJSWDdP9upQjQRZmUFYUr8ZLU",
    google_review_count: 604,
    google_rating_checked_at: "2026-08-19T06:53:37.336Z",
    google_address_verified: "10847台灣臺北市萬華區新起里長沙街二段128號3F/4F",
    booking_url: "https://hddcncreatives.wixsite.com/hddcngames",
    source_urls: ["https://hddcncreatives.wixsite.com/hddcngames"],
  },
  lostZhongxiao: {
    venue_name: "LOST Taiwan（台北忠孝店）",
    city: "台北市",
    district: "大安",
    google_rating: 4.8,
    google_place_id: "ChIJv6_XQfepQjQRjhlaS_bSCmo",
    google_review_count: 534,
    google_rating_checked_at: "2026-08-19T06:53:36.184Z",
    google_address_verified: "台北市大安區忠孝東路4段169號5樓",
    booking_url: "https://losttw.com/",
    source_urls: ["https://losttw.com/"],
  },
  missgame: {
    venue_name: "Miss GAME 密室逃脫（西門旗艦館）",
    city: "台北市",
    district: "萬華",
    google_rating: 4.9,
    google_place_id: "ChIJ-Skhsg6pQjQRZTgbRg7Lp5w",
    google_review_count: 10383,
    google_rating_checked_at: "2026-08-19T06:53:32.559Z",
    google_address_verified: "108台灣臺北市萬華區萬壽里漢中街24號",
    booking_url: "https://missgame.com.tw/",
    source_urls: ["https://missgame.com.tw/"],
  },
  qhat: {
    venue_name: "QhAt 帽子烤密室工廠",
    city: "台北市",
    district: "大安",
    google_rating: 4.9,
    google_place_id: "ChIJq-z2zmOpQjQR_sBQPQtnlVo",
    google_review_count: 1083,
    google_rating_checked_at: "2026-08-19T06:53:38.058Z",
    google_address_verified: "106台灣臺北市大安區龍坡里和平東路一段238號7樓",
    booking_url: "https://linktr.ee/qhatex",
    source_urls: ["https://linktr.ee/qhatex"],
  },
  lostStation: {
    venue_name: "LOST Taiwan（台北站前店）",
    city: "台北市",
    district: "中正",
    google_rating: 4.8,
    google_place_id: "ChIJv6_XQfepQjQRjhlaS_bSCmo",
    google_review_count: 534,
    google_rating_checked_at: "2026-08-19T06:53:36.184Z",
    google_address_verified: "台北市中正區許昌街30號7樓",
    booking_url: "https://losttw.com/",
    source_urls: ["https://losttw.com/"],
  },
};

const requests = [
  ["冥婚", "head"],
  ["黃道追弒", "head"],
  ["星靈", "lostZhongxiao"],
  ["所羅門之鑰", "lostZhongxiao"],
  ["喵境夢遊", "missgame"],
  ["逃出吸血古堡", "missgame"],
  ["即刻越獄", "missgame"],
  ["捉咪藏", "missgame"],
  ["獄罷不能", "qhat"],
  ["深夜拉麵鋪", "qhat"],
  ["巴貝時空工作室", "lostStation"],
  ["復活節島", "lostStation"],
];

const existingNames = new Set(topics.map((topic) => `${topic.venue_name}::${topic.name}`));
const additions = requests.flatMap(([name, sourceKey], index) => {
  const venue = sources[sourceKey];
  const key = `${venue.venue_name}::${name}`;
  if (existingNames.has(key)) return [];
  return [{
    id: `popular-${String(topics.length + index + 1).padStart(3, "0")}`,
    name,
    ...venue,
    ...shared,
    rating_scope: "店家／分店級 Google 評價（代理門檻）",
    google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）",
    data_quality: "user_requested_catalog_addition_with_venue_proxy",
    story_summary: `《${name}》目前收錄於主題目錄，完整玩法、人數與場次請以店家官方公告為準。`,
    story_summary_source_urls: venue.source_urls,
  }];
});

if (additions.length !== requests.length) {
  throw new Error(`Expected ${requests.length} new topics, found ${additions.length}`);
}

await fs.writeFile(file, `${JSON.stringify([...topics, ...additions], null, 2)}\n`);
console.log(JSON.stringify({ before: topics.length, added: additions.length, after: topics.length + additions.length }, null, 2));
