import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/topics.json");
const topics = JSON.parse(await fs.readFile(file, "utf8"));
const targetId = "popular-050";
const officialTopicUrl = "https://taog-game.com/%e5%8f%b0%e4%b8%ad%e8%8e%8e%e5%a3%ab%e6%af%94%e4%ba%9e%e7%9a%84%e9%邀%e8%ab%8b/";
const officialTopicUrlEncoded = "https://taog-game.com/%e5%8f%b0%e4%b8%ad%e8%8e%8e%e5%a3%ab%e6%af%94%e4%ba%9e%e7%9a%84%e9%82%80%e8%ab%8b/";

const target = topics.find((topic) => topic.id === targetId);
if (!target) throw new Error(`${targetId} was not found`);
if (target.name !== "神不在場" || target.venue_name !== "神不在場實境遊戲｜台南館") {
  throw new Error(`Unexpected replacement target: ${target.venue_name} / ${target.name}`);
}
if (topics.some((topic) => topic.name === "莎士比亞的邀請")) {
  throw new Error("莎士比亞的邀請 already exists; replacement would create a duplicate");
}

const replacement = {
  ...target,
  id: targetId,
  name: "莎士比亞的邀請",
  venue_name: "神不在場實境遊戲｜台中旗艦館",
  city: "台中市",
  district: "中區",
  google_rating: 4.9,
  rating_scope: "店家／分店級 Google 評價（代理門檻）",
  players: "2–4",
  duration: "90分鐘（體驗＋解說）",
  horror: null,
  brain: null,
  styles: ["主題解謎"],
  pros: ["適合新手入門"],
  cons: ["熱門時段建議提早確認"],
  booking_url: "https://taog-game.com/taichungbooking/",
  source_urls: ["https://taog-game.com/taichungbooking/", officialTopicUrlEncoded],
  google_place_id: "ChIJ-5kT4ok9aTQRIT7YjCMFyJ8",
  google_review_count: 1265,
  google_rating_checked_at: "2026-08-19T06:53:42.921Z",
  google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）",
  google_address_verified: "400台灣臺中市中區平等街34號",
  data_quality: "official_catalog_with_venue_proxy",
  duration_source: "官方主題頁",
  editorial_scale_scope: "編輯部導覽分級；非官方難度或玩家評分",
  story_summary: "《莎士比亞的邀請》帶隊伍進入有生命的魔書，接受文字與故事交織的機關挑戰；活動時間依官方公告。",
  story_summary_provenance: "official_page_topic_name_match_editorial_rewrite",
  story_summary_source_urls: [officialTopicUrlEncoded],
  story_summary_note: "此為導覽摘要，依官方主題頁公開資訊整理；場次、價格與活動內容依官網公告。",
  story_summary_source_excerpt: "神不在場發現，一本突如其來、年代久遠的書，似乎有了自己的生命。你願意冒險進到魔書，接受它的邀請嗎？",
  tag_provenance: "editorial_tags_derived_from_existing_topic_metadata",
  tag_provenance_note: "標籤僅作為導覽提示，依既有主題分類與編輯資料整理；不代表玩家實測心得或官方承諾。",
};

const next = topics.map((topic) => topic.id === targetId ? replacement : topic);
await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
console.log(JSON.stringify({ before: topics.length, after: next.length, replacedId: targetId, oldName: target.name, newName: replacement.name, newVenue: replacement.venue_name }, null, 2));
