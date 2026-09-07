import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const topicFile = path.join(root, "data/topics.json");
const venueFile = path.join(root, "data/venues.json");

/**
 * User-provided timeline. Year-only entries intentionally retain year precision;
 * no month is inferred when the user did not provide one.
 */
const releaseTimes = {
  "奪命鎖鏈": "2012 年 11 月",
  "許多門主題選集": "2012 年（首店成立）",
  "顛倒之室": "2013 年 5 月",
  "奪命鎖鏈2": "2013 年 11 月",
  "鬼新娘": "2013 年 12 月",
  "莎士比亞的邀請": "2013 年",
  "法老謎城": "2013 年",
  "越南大戰": "2013 年",
  "戰鬥陀螺": "2013 年",
  "竹本家": "2014 年 2 月",
  "失落魔境：序章": "2014 年 5 月",
  "醉後一杯": "2014 年",
  "黑暗倒影": "2014 年",
  "美夢｜咒雨": "2014 年",
  "惡夢｜安雅": "2014 年",
  "羅伯班克": "2015 年 3 月",
  "稻荷之歌": "2015 年",
  "馬雅神殿": "2015 年",
  "玩具總動員": "2015 年",
  "倒數 60 分鐘": "2015 年",
  "感染": "2016 年",
  "病變": "2016 年",
  "永生劫": "2016 年",
  "觀落陰": "2016 年",
  "屍變": "2016 年",
  "絕命旅舍": "2016 年",
  "車諾比事件": "2016 年",
  "愛麗絲仙境": "2016 年",
  "越獄逃生": "2016 年",
  "武仁新村": "2017 年",
  "入學式": "2017 年",
  "平安戲院": "2017 年",
  "鎮魂曲：迴憶宅邸": "2017 年",
  "彼岸花－夢返": "2017 年",
  "罪夢真相": "2017 年",
  "這個Case有點Big": "2017 年",
  "利維德酒吧": "2017 年",
  "噩夢首部曲：記憶牢籠": "2017 年",
  "噩夢二部曲：戰慄空間": "2017 年",
  "噬夢": "2018 年",
  "蜀山": "2018 年",
  "天方夜譚": "2018 年",
  "瞞天越獄": "2018 年",
  "搜索令": "2018 年",
  "瘋狂追殺": "2018 年",
  "惡夢｜籠中鳥": "2018 年",
  "偵探夢｜抓狂首映會": "2018 年",
  "明星夢｜偶像出道": "2018 年",
  "極恐惡夢｜INSANE": "2018 年",
  "玩偶之家 Dolls’ House": "2018 年",
  "賽博龐克": "2018 年",
  "夢境駭客Ⅰ": "2018 年",
  "所羅門之鑰": "2018 年",
  "九龍寨城": "2019 年",
  "櫻花暖居": "2019 年",
  "夜蒐樓靜": "2019 年",
  "嬰聲": "2019 年",
  "森林之心": "2019 年",
  "霸王": "2019 年",
  "審判者": "2019 年",
  "盜義有道": "2019 年",
  "弗瑞克樂園": "2019 年",
  "消失的聖誕禮物": "2019 年",
  "恐懼聖所": "2019 年",
  "逃出吸血古堡": "2019 年",
  "即刻越獄": "2019 年",
  "捉咪藏": "2019 年",
  "獄罷不能": "2019 年",
  "猛鬼大廈": "2020 年 7 月",
  "潛入任務": "2020 年",
  "異形覆沒": "2020 年",
  "等一個人‧盜墓": "2020 年",
  "小小鎮": "2020 年",
  "是不是勇者": "2020 年",
  "邪咒曲": "2020 年",
  "輪迴": "2020 年",
  "窒愛": "2020 年",
  "詭鄰驚怪": "2020 年",
  "深夜拉麵鋪": "2020 年",
  "巴貝時空工作室": "2020 年",
  "復活節島": "2020 年",
  "重返糖果屋": "2020 年",
  "三更": "2020 年",
  "誕生": "2020 年",
  "鬼不語": "2020 年",
  "百鬼夜行": "2021 年 10 月",
  "魔幻菜市場": "2021 年",
  "嬰魂嚇水道": "2021 年",
  "奪魂獄": "2021 年",
  "LINA": "2021 年",
  "巷仔口": "2021 年",
  "陰緣": "2021 年",
  "花見小路": "2021 年",
  "聖劍騎士": "2021 年",
  "荒村小學": "2021 年",
  "見鬼十法": "2021 年",
  "我們的秘密": "2022 年 3 月",
  "深處": "2022 年 8 月",
  "咖波與飢餓迷宮": "2022 年 12 月",
  "醫怨": "2022 年",
  "詐屍": "2022 年",
  "塊陶格子360": "2022 年",
  "塊陶雷射": "2022 年",
  "草鳴村怪談": "2022 年",
  "冥婚": "2022 年",
  "44廳逝世廳": "2022 年",
  "新年接招了": "2023 年 1 月",
  "殛時": "2023 年 5 月",
  "殛時+冥婚": "2023 年 5 月",
  "第九夜": "2023 年",
  "山中小屋藏身處": "2023 年",
  "鬱金香": "2023 年",
  "賊-十載春秋": "2023 年",
  "奎蕾精神病院": "2023 年",
  "殭局": "2023 年",
  "理髮師陶德卡特": "2024 年 1 月",
  "失物招領": "2024 年上半年",
  "301號房": "2024 年上半年",
  "藝樣的代價": "2024 年上半年",
  "朱砂": "2024 年年中",
  "伴": "2024 年年中",
  "怨憶": "2024 年年中",
  "康樂保衛戰": "2024 年下半年",
  "寶寶睡": "2024 年下半年",
};

function updateItems(items) {
  let updated = 0;
  const matchedNames = new Set();
  const nextItems = items.map((item) => {
    const releaseTime = releaseTimes[item.name];
    if (!releaseTime) return item;
    updated += 1;
    matchedNames.add(item.name);
    return { ...item, release_time: releaseTime };
  });
  return { nextItems, updated, matchedNames };
}

const topics = JSON.parse(await fs.readFile(topicFile, "utf8"));
const venues = JSON.parse(await fs.readFile(venueFile, "utf8"));
const topicResult = updateItems(topics);
const venueResults = venues.map((venue) => {
  const result = updateItems(venue.themes ?? []);
  return { venue: { ...venue, themes: result.nextItems }, ...result };
});

const matchedNames = new Set(topicResult.matchedNames);
for (const result of venueResults) {
  for (const name of result.matchedNames) matchedNames.add(name);
}
const missingNames = Object.keys(releaseTimes).filter((name) => !matchedNames.has(name));

await fs.writeFile(topicFile, `${JSON.stringify(topicResult.nextItems, null, 2)}\n`, "utf8");
await fs.writeFile(venueFile, `${JSON.stringify(venueResults.map(({ venue }) => venue), null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  timelineEntries: Object.keys(releaseTimes).length,
  topicsUpdated: topicResult.updated,
  venueThemesUpdated: venueResults.reduce((total, result) => total + result.updated, 0),
  missingNames,
}, null, 2));
