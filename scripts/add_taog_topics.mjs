import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/topics.json");
const topics = JSON.parse(await fs.readFile(file, "utf8"));

const officialUrl = "https://taog-game.com/taichungbooking/";
const taichungPlace = {
  venue_name: "神不在場實境遊戲｜台中旗艦館",
  city: "台中市",
  district: "中區",
  google_rating: 4.9,
  rating_scope: "店家／分店級 Google 評價（代理門檻）",
  google_place_id: "ChIJ-5kT4ok9aTQRIT7YjCMFyJ8",
  google_review_count: 1265,
  google_rating_checked_at: "2026-08-19T06:53:42.921Z",
  google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）",
  google_address_verified: "400台灣臺中市中區平等街34號",
  booking_url: officialUrl,
  source_urls: [officialUrl],
};

const additions = [
  {
    id: "popular-113",
    name: "失落的隕石神殿",
    ...taichungPlace,
    players: "7–10",
    duration: "120分鐘（體驗＋解說）",
    horror: null,
    brain: null,
    styles: ["主題解謎"],
    pros: ["場景營造具沉浸感"],
    cons: ["熱門時段建議提早確認"],
    data_quality: "official_catalog_with_venue_proxy",
    duration_source: "官方主題頁",
    editorial_scale_scope: "編輯部導覽分級；非官方難度或玩家評分",
    story_summary: "《失落的隕石神殿》帶隊伍深入古埃及神殿探險，透過團隊合作破解沿途謎題；活動時間與場次依官方公告。",
    story_summary_provenance: "official_page_topic_name_match_editorial_rewrite",
    story_summary_source_urls: ["https://taog-game.com/%E5%8F%B0%E4%B8%AD%E5%A4%B1%E8%90%BD%E7%9A%84%E9%9A%95%E7%9F%B3%E7%A5%9E%E6%AE%BF/"],
    story_summary_note: "此為導覽摘要，依官方主題頁公開資訊整理；場次、價格與活動內容依官網公告。",
    story_summary_source_excerpt: "最近在撒哈拉沙漠發生一起隕石撞擊事件！隕石坑洞中竟出現一個古埃及神殿入口…神不在場的探險隊，尋找未知踏上旅程吧！",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "標籤僅作為導覽提示，依既有主題分類與編輯資料整理；不代表玩家實測心得或官方承諾。",
  },
  {
    id: "popular-114",
    name: "重返糖果屋",
    ...taichungPlace,
    players: "2–4",
    duration: "90分鐘（體驗＋解說）",
    horror: null,
    brain: null,
    styles: ["主題解謎"],
    pros: ["場景營造具沉浸感"],
    cons: ["熱門時段建議提早確認"],
    data_quality: "official_catalog_with_venue_proxy",
    duration_source: "官方主題頁",
    editorial_scale_scope: "編輯部導覽分級；非官方難度或玩家評分",
    story_summary: "《重返糖果屋》將隊伍帶回失控的黑暗童話，在精緻場景中尋找線索並揭開真相；活動時間依官方公告。",
    story_summary_provenance: "official_page_topic_name_match_editorial_rewrite",
    story_summary_source_urls: ["https://taog-game.com/%E5%8F%B0%E4%B8%AD-%E9%87%8D%E8%BF%94%E7%B3%96%E6%9E%9C%E5%B1%8B/"],
    story_summary_note: "此為導覽摘要，依官方主題頁公開資訊整理；場次、價格與活動內容依官網公告。",
    story_summary_source_excerpt: "漢賽爾與葛麗特逃出糖果屋後，本應過上平凡的生活。然而，葛麗特找上童話維護局，表示漢賽爾陷入了著魔般的執念。",
    tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
    tag_provenance_note: "標籤僅作為導覽提示，依既有主題分類與編輯資料整理；不代表玩家實測心得或官方承諾。",
  },
];

const tainan = topics.filter((topic) => topic.venue_name === "神不在場實境遊戲｜台南館");
if (tainan.length === 0) throw new Error("Tainan 神不在場 venue was not found");
const normalized = topics.map((topic) => topic.venue_name === "神不在場實境遊戲｜台南館"
  ? {
      ...topic,
      google_rating: 4.7,
      google_place_id: "ChIJYxlgy8Z2bjQRHmAGCyWbW4Q",
      google_review_count: 1122,
      google_rating_checked_at: "2026-08-19T06:53:50.012Z",
      google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）",
      google_address_verified: "710台灣台南市永康區勝利里中華路1-2號3樓",
      booking_url: "https://taog-game.com/booking/",
      source_urls: ["https://taog-game.com/booking/"],
    }
  : topic);

const keys = new Set(normalized.map((topic) => `${topic.venue_name}::${topic.name}`));
for (const addition of additions) {
  if (keys.has(`${addition.venue_name}::${addition.name}`)) throw new Error(`Topic already exists: ${addition.name}`);
}

await fs.writeFile(file, `${JSON.stringify([...normalized, ...additions], null, 2)}\n`);
console.log(JSON.stringify({ before: topics.length, normalizedTainan: tainan.length, added: additions.length, after: topics.length + additions.length }, null, 2));
