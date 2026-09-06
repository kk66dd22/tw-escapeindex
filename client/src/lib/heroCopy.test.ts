import { describe, expect, it } from "vitest";
import { HERO_COPY } from "./heroCopy";

describe("首頁 Hero 文案", () => {
  it("移除工程編號並提供指定的導覽標籤", () => {
    expect(HERO_COPY.archiveLabel).toBe("ROOMS ARCHIVE");
    expect(HERO_COPY.radarLabel).toBe("台灣密室逃脫／主題篩選指南");
    expect(`${HERO_COPY.archiveLabel} ${HERO_COPY.radarLabel}`).not.toMatch(/03|\//);
  });

  it("呈現指定的開團主標題與 124 場主題資料說明", () => {
    expect(`${HERO_COPY.headlineFirst}${HERO_COPY.headlineSecond}`).toBe("一鍵篩選，今晚開團不踩雷。");
    expect(HERO_COPY.subtitle).toBe("別急著先找店家，先挑出今晚真正想玩的主題。全台 124 場主題資料，讓你把人數、難度與恐怖度一次比清楚。");
  });
});
