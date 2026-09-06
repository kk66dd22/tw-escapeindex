import { describe, expect, it } from "vitest";
import topics from "../data/topics.json";
import fs from "node:fs";
import path from "node:path";

const allowedPros = new Set([
  "適合喜愛機關解謎的玩家",
  "場景營造具沉浸感",
  "謎題與劇情具挑戰性",
  "適合新手入門",
  "適合 2 人小隊",
  "設有真人互動元素",
  "場景細節值得留意",
  "謎題與星座元素結合",
  "機關操作比重較高",
  "懸疑故事具分支感",
  "短時間即可完成體驗",
  "適合輕鬆走訪西門町",
  "無順序、無計時",
  "機關互動比重較高",
  "動手操作比重較高",
]);

const allowedCons = new Set([
  "熱門時段建議提早確認",
  "部分謎題較具挑戰性",
  "部分區域活動空間較有限",
  "遊玩時需留意體力分配",
  "新手可能需要較多提示",
  "熟悉密室玩法的玩家可能較快上手",
  "提示資訊建議於開場時確認",
  "需要較多推理與討論",
  "場地內有貓毛，過敏體質者請審慎評估",
  "遊戲體驗時間較短",
  "戶外進行需留意天候與交通",
  "需留意互動機關與場景變化",
  "前段邏輯題可能需要提示",
  "部分操作需留意場景動線",
  "部分邏輯題需較多時間",
]);

describe("catalog copy localization", () => {
  it("uses only the approved optional tag vocabulary", () => {
    expect(topics).toHaveLength(124);
    const requestedTopics = [
      ["冥婚", "頭癮創意遊戲（西門店）"],
      ["黃道追弒", "頭癮創意遊戲（西門店）"],
      ["星靈", "LOST Taiwan（台北忠孝店）"],
      ["所羅門之鑰", "LOST Taiwan（台北忠孝店）"],
      ["喵境夢遊", "Miss GAME 密室逃脫（西門旗艦館）"],
      ["逃出吸血古堡", "Miss GAME 密室逃脫（西門旗艦館）"],
      ["即刻越獄", "Miss GAME 密室逃脫（西門旗艦館）"],
      ["捉咪藏", "Miss GAME 密室逃脫（西門旗艦館）"],
      ["獄罷不能", "QhAt 帽子烤密室工廠"],
      ["深夜拉麵鋪", "QhAt 帽子烤密室工廠"],
      ["巴貝時空工作室", "LOST Taiwan（台北站前店）"],
      ["復活節島", "LOST Taiwan（台北站前店）"],
      ["失落的隕石神殿", "神不在場實境遊戲｜台中旗艦館"],
      ["重返糖果屋", "神不在場實境遊戲｜台中旗艦館"],
      ["莎士比亞的邀請", "神不在場實境遊戲｜台中旗艦館"],
      ["三更", "鎮冥工作室"],
      ["誕生", "百室達密室脫逃"],
      ["鬼不語", "山裏工作室"],
      ["LINA", "梅林的鬍子遊戲工作室"],
      ["巷仔口", "梅林的鬍子遊戲工作室"],
      ["陰緣", "梅林的鬍子遊戲工作室"],
      ["花見小路", "梅林的鬍子遊戲工作室"],
      ["聖劍騎士", "梅林的鬍子遊戲工作室"],
      ["荒村小學", "塊陶阿工作室"],
      ["見鬼十法", "塊陶阿工作室"],
    ] as const;
    for (const [name, venue] of requestedTopics) {
      expect(topics.some((topic) => topic.name === name && topic.venue_name === venue)).toBe(true);
    }
    expect(topics.some((topic) => topic.name === "神不在場" && topic.venue_name === "神不在場實境遊戲｜台南館")).toBe(false);
    expect(topics.filter((topic) => topic.city === "宜蘭市")).toHaveLength(5);
    expect(topics.filter((topic) => topic.city === "桃園市")).toEqual([
      expect.objectContaining({ name: "荒村小學", venue_name: "塊陶阿工作室", district: "中壢店" }),
    ]);
    expect(topics.find((topic) => topic.name === "見鬼十法" && topic.venue_name === "塊陶阿工作室")).toMatchObject({ city: "台北市", district: "晴光店｜中山" });
    for (const topic of topics) {
      expect(topic.pros.length).toBeLessThanOrEqual(2);
      expect(topic.cons.length).toBeLessThanOrEqual(2);
      expect(topic.pros.every((tag) => allowedPros.has(tag))).toBe(true);
      expect(topic.cons.every((tag) => allowedCons.has(tag))).toBe(true);
    }
  });

  it("keeps corrected theme names, horror indices, and summaries synchronized", () => {
    const dreamReturnTheme = topics.find((topic) => topic.id === "popular-037");
    const funlockTheme = topics.find((topic) => topic.id === "popular-056");
    const anyaTheme = topics.find((topic) => topic.id === "popular-061");

    expect(dreamReturnTheme).toMatchObject({
      name: "彼岸花－夢返",
      horror: 2,
      venue_name: "FUNLOCK 放樂工作室",
    });
    expect(dreamReturnTheme?.story_summary).toContain("《彼岸花－夢返》");
    expect(funlockTheme).toMatchObject({
      name: "彼岸花－神渡",
      horror: 4,
      venue_name: "FUNLOCK 放樂工作室",
    });
    expect(funlockTheme?.story_summary).toContain("《彼岸花－神渡》");
    expect(anyaTheme).toMatchObject({
      name: "惡夢｜安雅",
      horror: 5,
      venue_name: "夢遊王國",
    });
    expect(topics.some((topic) => topic.id === "popular-056" && topic.name === "彼岸花")).toBe(false);
    expect(topics.filter((topic) => topic.venue_name === "FUNLOCK 放樂工作室" && topic.name.includes("彼岸花")).map((topic) => topic.name)).toEqual(["彼岸花－夢返", "彼岸花－神渡"]);
    expect(topics.some((topic) => topic.name === "彼岸花")).toBe(false);
    expect(topics.some((topic) => topic.name === "彼岸花：夢返")).toBe(false);
  });

  it("adds guide indices and navigation tags for the requested topics", () => {
    const enrichedNames = new Set([
      "冥婚",
      "黃道追弒",
      "星靈",
      "所羅門之鑰",
      "喵境夢遊",
      "逃出吸血古堡",
      "即刻越獄",
      "捉咪藏",
      "獄罷不能",
      "深夜拉麵鋪",
      "巴貝時空工作室",
      "復活節島",
      "莎士比亞的邀請",
      "重返糖果屋",
      "失落的隕石神殿",
    ]);
    const enrichedTopics = topics.filter((topic) => enrichedNames.has(topic.name));
    expect(enrichedTopics).toHaveLength(15);
    for (const topic of enrichedTopics) {
      expect(topic.editorial_scale_scope).toContain("編輯部導覽分級");
      expect(topic.editorial_scale_note).toContain("不代表官方標示或玩家評分");
      expect(topic.editorial_scale_source_urls.length).toBeGreaterThan(0);
      expect(topic.tag_provenance).toBe("editorial_tags_based_on_public_topic_descriptions");
      expect(topic.tag_provenance_note).toContain("不代表玩家實測心得或官方承諾");
      expect(topic.horror).toBeGreaterThanOrEqual(1);
      expect(topic.horror).toBeLessThanOrEqual(5);
      expect(topic.brain).toBeGreaterThanOrEqual(1);
      expect(topic.brain).toBeLessThanOrEqual(5);
    }

    const topicsWithNewTags = enrichedTopics.filter((topic) =>
      ["冥婚", "黃道追弒", "星靈", "所羅門之鑰", "喵境夢遊", "逃出吸血古堡", "即刻越獄", "捉咪藏", "獄罷不能", "深夜拉麵鋪", "巴貝時空工作室", "復活節島"].includes(topic.name),
    );
    for (const topic of topicsWithNewTags) {
      expect(topic.pros.length).toBeGreaterThan(0);
      if (!topic.pros.includes("謎題與劇情具挑戰性")) {
        expect(topic.cons.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses the requested booking details for the 14 updated topics", () => {
    const expected = {
      冥婚: ["https://onelink.one/s/ypaD6", "1–4", "60 分鐘（含講解）"],
      黃道追弒: ["https://linkgo.one/s/QPdMA", "4–10", "120 分鐘（含講解）"],
      觀落陰: ["https://afflink.one/s/VIlBq", "2–6", "80 分鐘"],
      法老: ["https://onelink.one/s/QJnL0", "2–6", "70 分鐘"],
      喵境夢遊: ["https://afflink.one/s/OI9CU", "2–6", "90 分鐘"],
      逃出吸血古堡: ["https://onelink.one/s/7leLl", "2–6", "60 分鐘"],
      即刻越獄: ["https://onelink.one/s/Y4dq6", "2–6", "30 分鐘"],
      捉咪藏: ["https://afflink.one/s/0ocGY", "1–4", "120 分鐘"],
      深夜拉麵鋪: ["https://onelink.one/s/MIqHH", "2–6", "80 分鐘（含講解）"],
      獄罷不能: ["https://afflink.one/s/fWeAN", "2–6", "80 分鐘（含講解）"],
      巴貝時空工作室: ["https://onelink.one/s/nuYjE", "2–6", "70 分鐘（含講解）"],
      復活節島: ["https://onelink.one/s/cn6aQ", "3–6", "70 分鐘（含講解）"],
      星靈: ["https://linkgo.one/s/5G1eg", "2–6", "60 分鐘"],
      所羅門之鑰: ["https://onelink.one/s/kmjvr", "2–6", "60 分鐘"],
    };
    for (const [name, [bookingUrl, players, duration]] of Object.entries(expected)) {
      const matches = topics.filter((topic) => topic.name === name);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ booking_url: bookingUrl, players, duration });
    }
  });

  it("does not pair the challenge pros tag with its duplicate cons tag", () => {
    for (const topic of topics) {
      if (topic.pros.includes("謎題與劇情具挑戰性")) {
        expect(topic.cons).not.toContain("部分謎題較具挑戰性");
      }
    }
  });

  it("contains no forbidden status or duplicated campaign wording", () => {
    const content = JSON.stringify(topics);
    for (const forbidden of ["符核對", "符核", "待核對", "依官網為主", "活動活動", "沉浸劇情", "神還原", "神作", "大推", "推坑", "爆評", "官方現行主題", "破解反轉"]) {
      expect(content).not.toContain(forbidden);
    }
  });

  it("keeps fixed field names and booking CTA in the homepage", () => {
    const home = fs.readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/Home.tsx"), "utf8");
    for (const label of ["建議人數", "遊戲時間", "恐怖指數", "燒腦程度", "前往官方預約頁", "導覽重點", "遊玩提醒"]) {
      expect(home).toContain(label);
    }
    expect(home).toContain("恐怖度與燒腦度分開標示，跨店家比較更直覺。");
    expect(home).toContain("活動檔期與票價依官網公告。");
    expect(home).not.toContain("Google／分店評分參考");
  });

  it("keeps summaries descriptive, neutral, and separate from metadata labels", () => {
    for (const topic of topics) {
      expect(topic.styles).not.toContain("官方現行主題");
      expect(topic.story_summary).toContain(`《${topic.name}》`);
      expect(topic.story_summary).not.toMatch(/沿著.*往前查|破解反轉|恐怖真相現形/);
      expect(topic.story_summary_note).toContain("依官網公告");
    }
  });
});
