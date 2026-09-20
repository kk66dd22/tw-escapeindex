const INAPPROPRIATE_PATTERNS = [
  /賭博|博彩|賭場|老虎機|娛樂城|六合彩|地下賭場|下注|返水|輪盤|casino|betting|poker/i,
  /色情|成人影片|裸聊|約砲|援交|賣淫|情色|色誘|porn|hentai/i,
  /詐騙|洗錢|高利貸|貸款代辦|借錢|代購|刷卡套現/i,
  /加賴|加LINE|加微信|加telegram|加tg|私訊領取|聯絡我|聯繫我|客服專員|官方客服/i,
] as const;

const PROMOTIONAL_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /bit\.ly|tinyurl\.com|t\.me\//i,
  /discord\.gg|line\.me\//i,
  /免費送|限時優惠|立即下單|點擊連結|點我領取|誠徵代理|招募會員|保證獲利/i,
] as const;

const MODERATION_MESSAGE = "留言包含不適當或廣告內容，請修改後重試。";

function compactText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-TW")
    .replace(/[\s\u200b\u200c\u200d]+/g, "");
}

function hasRepeatedCharacters(value: string) {
  return /(.)\1{5,}/.test(value);
}

function hasRepeatedPhrase(value: string) {
  // Catch low-effort wash-posting such as「加好友加好友加好友」without blocking normal repeated words.
  return /(.{2,8})\1{3,}/.test(value);
}

export type ModerationResult =
  | { allowed: true }
  | { allowed: false; message: typeof MODERATION_MESSAGE; reason: "keyword" | "promotion" | "repetition" };

export function moderateComment(body: string): ModerationResult {
  const normalized = compactText(body);

  if (INAPPROPRIATE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { allowed: false, message: MODERATION_MESSAGE, reason: "keyword" };
  }
  if (PROMOTIONAL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { allowed: false, message: MODERATION_MESSAGE, reason: "promotion" };
  }
  if (hasRepeatedCharacters(normalized) || hasRepeatedPhrase(normalized)) {
    return { allowed: false, message: MODERATION_MESSAGE, reason: "repetition" };
  }

  return { allowed: true };
}

export { MODERATION_MESSAGE };
