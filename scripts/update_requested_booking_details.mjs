import fs from "node:fs";
import path from "node:path";

const dataPath = path.resolve("data/topics.json");
const topics = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const updates = {
  冥婚: {
    booking_url: "https://onelink.one/s/ypaD6",
    players: "1–4",
    duration: "60 分鐘（含講解）",
  },
  黃道追弒: {
    booking_url: "https://linkgo.one/s/QPdMA",
    players: "4–10",
    duration: "120 分鐘（含講解）",
  },
  觀落陰: {
    booking_url: "https://afflink.one/s/VIlBq",
    players: "2–6",
    duration: "80 分鐘",
  },
  法老: {
    booking_url: "https://onelink.one/s/QJnL0",
    players: "2–6",
    duration: "70 分鐘",
  },
  喵境夢遊: {
    booking_url: "https://afflink.one/s/OI9CU",
    players: "2–6",
    duration: "90 分鐘",
  },
  逃出吸血古堡: {
    booking_url: "https://onelink.one/s/7leLl",
    players: "2–6",
    duration: "60 分鐘",
  },
  即刻越獄: {
    booking_url: "https://onelink.one/s/Y4dq6",
    players: "2–6",
    duration: "30 分鐘",
  },
  捉咪藏: {
    booking_url: "https://afflink.one/s/0ocGY",
    players: "1–4",
    duration: "120 分鐘",
  },
  深夜拉麵鋪: {
    booking_url: "https://onelink.one/s/MIqHH",
    players: "2–6",
    duration: "80 分鐘（含講解）",
  },
  獄罷不能: {
    booking_url: "https://afflink.one/s/fWeAN",
    players: "2–6",
    duration: "80 分鐘（含講解）",
  },
  巴貝時空工作室: {
    booking_url: "https://onelink.one/s/nuYjE",
    players: "2–6",
    duration: "70 分鐘（含講解）",
  },
  復活節島: {
    booking_url: "https://onelink.one/s/cn6aQ",
    players: "3–6",
    duration: "70 分鐘（含講解）",
  },
  星靈: {
    booking_url: "https://linkgo.one/s/5G1eg",
    players: "2–6",
    duration: "60 分鐘",
  },
  所羅門之鑰: {
    booking_url: "https://onelink.one/s/kmjvr",
    players: "2–6",
    duration: "60 分鐘",
  },
};

for (const [name, update] of Object.entries(updates)) {
  const matches = topics.filter((topic) => topic.name === name);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one topic named ${name}, found ${matches.length}`);
  }
  Object.assign(matches[0], update);
}

const challengePros = "謎題與劇情具挑戰性";
const duplicateChallengeCons = "部分謎題較具挑戰性";
let removedConflicts = 0;
for (const topic of topics) {
  if (topic.pros.includes(challengePros) && topic.cons.includes(duplicateChallengeCons)) {
    topic.cons = topic.cons.filter((tag) => tag !== duplicateChallengeCons);
    removedConflicts += 1;
  }
}

fs.writeFileSync(dataPath, `${JSON.stringify(topics, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      updatedTopics: Object.keys(updates).length,
      removedConflicts,
      totalTopics: topics.length,
    },
    null,
    2,
  ),
);
