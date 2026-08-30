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
]);

describe("catalog copy localization", () => {
  it("uses only the approved optional tag vocabulary", () => {
    expect(topics).toHaveLength(114);
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
      ["神不在場", "神不在場實境遊戲｜台南館"],
    ] as const;
    for (const [name, venue] of requestedTopics) {
      expect(topics.some((topic) => topic.name === name && topic.venue_name === venue)).toBe(true);
    }
    for (const topic of topics) {
      expect(topic.pros.length).toBeLessThanOrEqual(2);
      expect(topic.cons.length).toBeLessThanOrEqual(2);
      expect(topic.pros.every((tag) => allowedPros.has(tag))).toBe(true);
      expect(topic.cons.every((tag) => allowedCons.has(tag))).toBe(true);
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
