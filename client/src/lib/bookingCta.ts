export const ADVENTURER_GUILD_BOOKING_URL = "https://linkgo.one/s/3xwIG";
export const ADVENTURER_GUILD_CTA_LABEL = "預約冒險者公會聚餐";

const ADVENTURER_GUILD_TOPIC_NAMES = new Set(["莎士比亞的邀請", "重返糖果屋", "失落的隕石神殿"]);

export function shouldShowAdventurerGuildCta(venueName: string, topicName: string) {
  return venueName === "神不在場實境遊戲｜台中旗艦館" && ADVENTURER_GUILD_TOPIC_NAMES.has(topicName);
}

export function bookingCtaLayoutClassName(showSecondary: boolean) {
  return showSecondary ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3";
}
