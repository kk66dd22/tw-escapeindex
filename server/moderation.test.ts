import { describe, expect, it } from "vitest";
import { MODERATION_MESSAGE, moderateComment } from "./moderation";

describe("comment moderation", () => {
  it("allows normal escape-room reviews", () => {
    expect(moderateComment("謎題設計很有趣，工作人員提示得很剛好，推薦喜歡機關解謎的人。")).toEqual({ allowed: true });
  });

  it.each([
    "加入我們的娛樂城，立即下注領取返水",
    "免費送點數，點擊連結立即下單 https://example.com",
    "成人影片裸聊客服請加LINE",
  ])("blocks inappropriate or promotional content: %s", (body) => {
    const result = moderateComment(body);
    expect(result.allowed).toBe(false);
    expect(result).toMatchObject({ message: MODERATION_MESSAGE });
  });

  it("blocks repeated-character and repeated-phrase spam", () => {
    expect(moderateComment("哈哈哈哈哈哈").allowed).toBe(false);
    expect(moderateComment("加好友加好友加好友加好友").allowed).toBe(false);
  });

  it("normalizes full-width text and whitespace before matching", () => {
    expect(moderateComment("娛 樂 城　立即下注").allowed).toBe(false);
  });
});
