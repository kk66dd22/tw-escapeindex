import { describe, expect, it } from "vitest";
import topics from "../data/topics.json";
import fs from "node:fs";
import path from "node:path";

const allowedPros = new Set([
  "沉浸式場景神還原",
  "全機關老手大推",
  "劇情反轉超燒腦",
  "機關控必玩神作",
  "新手推坑首選",
  "小團2人即可開始",
  "NPC互動極具張力",
  "場景細節控必玩",
]);

const allowedCons = new Set([
  "熱門時段較難預約",
  "部分謎題較困難",
  "空間稍微較擁擠",
  "極度消耗體力",
  "新手容易卡關",
  "老手可能會覺得偏簡單",
  "語音提示不清晰",
  "極度考驗腦力",
]);

describe("catalog copy localization", () => {
  it("uses only the approved optional tag vocabulary", () => {
    expect(topics).toHaveLength(100);
    for (const topic of topics) {
      expect(topic.pros.length).toBeLessThanOrEqual(2);
      expect(topic.cons.length).toBeLessThanOrEqual(2);
      expect(topic.pros.every((tag) => allowedPros.has(tag))).toBe(true);
      expect(topic.cons.every((tag) => allowedCons.has(tag))).toBe(true);
    }
  });

  it("contains no forbidden status or duplicated campaign wording", () => {
    const content = JSON.stringify(topics);
    for (const forbidden of ["符核對", "符核", "待核對", "依官網為主", "活動活動", "沉浸劇情"]) {
      expect(content).not.toContain(forbidden);
    }
  });

  it("keeps fixed field names and booking CTA in the homepage", () => {
    const home = fs.readFileSync(path.resolve(import.meta.dirname, "../client/src/pages/Home.tsx"), "utf8");
    for (const label of ["建議人數", "遊戲時間", "恐怖指數", "燒腦程度", "立即預約此主題（享獨家優惠）"]) {
      expect(home).toContain(label);
    }
    expect(home).toContain("跨店家資訊比對完整度高");
    expect(home).toContain("活動檔期與票價請見官方公告");
    expect(home).not.toContain("Google／分店評分參考");
  });
});
