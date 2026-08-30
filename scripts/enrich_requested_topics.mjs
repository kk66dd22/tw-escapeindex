import fs from "node:fs";
import path from "node:path";

const dataPath = path.resolve("data/topics.json");
const topics = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const scaleScope = "編輯部導覽分級；非官方難度或玩家評分";
const scaleNote =
  "恐怖／燒腦為編輯部 1–5 導覽分級，依官方主題描述與公開主題資料整理；不代表官方標示或玩家評分。";
const tagProvenance = "editorial_tags_based_on_public_topic_descriptions";
const tagProvenanceNote =
  "導覽重點與遊玩提醒依官方主題頁及公開主題介紹中的遊戲形式、場景與活動方式整理；不代表玩家實測心得或官方承諾。";

const updates = {
  "popular-050": {
    horror: 1,
    brain: 3,
    editorial_scale_source_urls: [
      "https://taog-game.com/taichungbooking/",
      "https://taog-game.com/%e5%8f%b0%e4%b8%ad%e8%8e%8e%e5%a3%ab%e6%AF%94%e4%BA%9e%e7%9A%84%e9%82%80%e8%AB%8b/",
    ],
  },
  "popular-101": {
    horror: 4,
    brain: 3,
    pros: ["場景營造具沉浸感"],
    cons: ["熱門時段建議提早確認"],
    editorial_scale_source_urls: ["https://hddcncreatives.wixsite.com/hddcngames"],
  },
  "popular-102": {
    horror: 2,
    brain: 4,
    pros: ["謎題與劇情具挑戰性"],
    cons: ["部分謎題較具挑戰性"],
    editorial_scale_source_urls: ["https://hddcncreatives.wixsite.com/hddcngames"],
  },
  "popular-103": {
    horror: 1,
    brain: 4,
    pros: ["適合喜愛機關解謎的玩家", "謎題與星座元素結合"],
    cons: ["部分謎題較具挑戰性"],
    editorial_scale_source_urls: [
      "https://losttw.com/rooms/%E6%98%9F%E9%9D%88-tetrabiblos/",
      "https://roger5050.pixnet.net/blog/posts/15282244096",
    ],
  },
  "popular-104": {
    horror: 2,
    brain: 4,
    pros: ["謎題與劇情具挑戰性", "機關操作比重較高"],
    cons: ["部分謎題較具挑戰性"],
    editorial_scale_source_urls: [
      "https://losttw.com/rooms/%E6%89%80%E7%BE%85%E9%96%80%E4%B9%8B%E9%91%B0-key-of-solomon/",
      "https://roger5050.pixnet.net/blog/posts/15282415624",
    ],
  },
  "popular-105": {
    horror: 1,
    brain: 2,
    pros: ["適合新手入門", "場景營造具沉浸感"],
    cons: ["場地內有貓毛，過敏體質者請審慎評估"],
    editorial_scale_source_urls: ["https://www.missgame.com.tw/meowdream"],
  },
  "popular-106": {
    horror: 4,
    brain: 3,
    pros: ["場景營造具沉浸感", "懸疑故事具分支感"],
    cons: ["熱門時段建議提早確認"],
    editorial_scale_source_urls: [
      "https://www.missgame.com.tw/vampireofoldcastle",
      "https://marine0722.blog126.fc2.com/blog-entry-53.html",
    ],
  },
  "popular-107": {
    horror: 1,
    brain: 2,
    pros: ["適合新手入門", "短時間即可完成體驗"],
    cons: ["遊戲體驗時間較短"],
    editorial_scale_source_urls: ["https://www.missgame.com.tw/prisonbreak-1"],
  },
  "popular-108": {
    horror: 1,
    brain: 2,
    pros: ["適合輕鬆走訪西門町", "無順序、無計時"],
    cons: ["戶外進行需留意天候與交通"],
    editorial_scale_source_urls: [
      "https://missgamedemo.myboostime.app/products/nppjmzhe",
      "https://www.missgame.com.tw/stores",
    ],
  },
  "popular-109": {
    horror: 1,
    brain: 2,
    pros: ["適合新手入門", "機關互動比重較高"],
    cons: ["部分操作需留意場景動線"],
    editorial_scale_source_urls: [
      "https://linktr.ee/qhatex",
      "https://bewithnene.tw/post-232317604/",
    ],
  },
  "popular-110": {
    horror: 1,
    brain: 2,
    pros: ["適合新手入門", "動手操作比重較高"],
    cons: ["需留意互動機關與場景變化"],
    editorial_scale_source_urls: [
      "https://linktr.ee/qhatex",
      "https://bewithnene.tw/post-232317604/",
      "https://yaescape.com/nightramen/",
    ],
  },
  "popular-111": {
    horror: 1,
    brain: 2,
    pros: ["機關操作比重較高", "適合新手入門"],
    cons: ["部分邏輯題需較多時間"],
    editorial_scale_source_urls: [
      "https://losttw.com/rooms/",
      "https://marine0722.blog.fc2.com/blog-entry-264.html",
    ],
  },
  "popular-112": {
    horror: 1,
    brain: 2,
    pros: ["機關操作比重較高", "場景細節值得留意"],
    cons: ["前段邏輯題可能需要提示"],
    editorial_scale_source_urls: [
      "https://losttw.com/rooms/",
      "https://marine0722.blog.fc2.com/blog-entry-284.html",
    ],
  },
  "popular-113": {
    horror: 1,
    brain: 3,
    editorial_scale_source_urls: [
      "https://taog-game.com/taichungbooking/",
      "https://taog-game.com/%E5%8F%B0%E4%B8%AD%E5%A4%B1%E8%90%BD%E7%9A%84%E9%9A%95%E7%9F%B3%E7%A5%9E%E6%AE%BF/",
    ],
  },
  "popular-114": {
    horror: 1,
    brain: 3,
    editorial_scale_source_urls: [
      "https://taog-game.com/taichungbooking/",
      "https://taog-game.com/%E5%8F%B0%E4%B8%AD-%E9%87%8D%E8%BF%94%E7%B3%96%E6%9E%9C%E5%B1%8B/",
    ],
  },
};

const topicById = new Map(topics.map((topic) => [topic.id, topic]));
for (const [id, update] of Object.entries(updates)) {
  const topic = topicById.get(id);
  if (!topic) throw new Error(`Missing topic: ${id}`);
  Object.assign(topic, {
    editorial_scale_scope: scaleScope,
    editorial_scale_note: scaleNote,
    tag_provenance: tagProvenance,
    tag_provenance_note: tagProvenanceNote,
    ...update,
  });
}

fs.writeFileSync(dataPath, `${JSON.stringify(topics, null, 2)}\n`);
console.log(`Enriched ${Object.keys(updates).length} requested topics with sourced editorial metadata.`);
