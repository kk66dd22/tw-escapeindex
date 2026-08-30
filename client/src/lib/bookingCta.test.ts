import { describe, expect, it } from "vitest";
import {
  ADVENTURER_GUILD_BOOKING_URL,
  ADVENTURER_GUILD_CTA_LABEL,
  bookingCtaLayoutClassName,
  shouldShowAdventurerGuildCta,
} from "./bookingCta";

describe("台中旗艦館冒險者公會預約 CTA", () => {
  it("只對三個指定主題顯示次按鈕", () => {
    const venue = "神不在場實境遊戲｜台中旗艦館";
    for (const topic of ["莎士比亞的邀請", "重返糖果屋", "失落的隕石神殿"]) {
      expect(shouldShowAdventurerGuildCta(venue, topic)).toBe(true);
    }
    expect(shouldShowAdventurerGuildCta(venue, "森林的哀嚎")).toBe(false);
    expect(shouldShowAdventurerGuildCta("神不在場實境遊戲｜台南館", "莎士比亞的邀請")).toBe(false);
  });

  it("提供正確次按鈕文案、網址與響應式排列 class", () => {
    expect(ADVENTURER_GUILD_CTA_LABEL).toBe("預約冒險者公會聚餐");
    expect(ADVENTURER_GUILD_BOOKING_URL).toBe("https://linkgo.one/s/3xwIG");
    expect(bookingCtaLayoutClassName(true)).toBe("grid grid-cols-1 gap-3 sm:grid-cols-2");
    expect(bookingCtaLayoutClassName(false)).toBe("grid grid-cols-1 gap-3");
  });
});
