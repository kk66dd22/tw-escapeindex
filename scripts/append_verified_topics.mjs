import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/topics.json");
const topics = JSON.parse(await fs.readFile(file, "utf8"));

const source = {
  funlock: "https://www.funlockstudio.com/",
  higanbana: "https://www.funlockstudio.com/higanhana/",
  missgame: "https://missgame.com.tw/",
  dream: "https://dream94zz.com/",
  mystoto: "https://www.mystotoescape.com/",
  througher: "https://througher.com.tw/",
  login: "https://loginescape.com/landingpagegooglemap",
  escer: "https://escer.com.tw/",
  zhenming: "https://escape.bar/game/26477",
  baishida: "https://escape.bar/game/26907",
  shanli: "https://escape.bar/game/26864",
  merlins: "https://www.yilanmerlinsbeard.com/",
  kuaitaoa: "https://www.kuaitaoa.cc/",
};

const rows = [
  ...[
    ["噬夢", "2–5", "約60分鐘", 2, 3, "台北市", "funlock"], ["感染", "2–6", "約60分鐘", 3, 3, "台北市", "funlock"], ["稻荷之歌", "2–6", "約60分鐘", 1, 3, "台北市", "funlock"], ["病變", "3–6", "約60分鐘", 3, 3, "台北市", "funlock"], ["永生劫", "2–6", "約60分鐘", 4, 4, "台北市", "funlock"], ["蜀山", "3–6", "約60分鐘", 2, 4, "台北市", "funlock"], ["天方夜譚", "2–6", "約60分鐘", 1, 3, "台北市", "funlock"], ["鄉間小盜", "2–6", "約60分鐘", 1, 3, "台北市", "funlock"], ["幻境奇航II：最終的航道", "4–8", "約90分鐘", 2, 4, "台北市", "funlock"], ["失落魔境：序章", "3–6", "約90分鐘", 1, 3, "台北市", "funlock"], ["鎮魂曲：迴憶宅邸", "4–6", "約100分鐘", 5, 4, "台北市", "funlock"], ["彼岸花－夢返", "4–5", "約90分鐘", 2, 3, "台北市", "higanbana"], ["彼岸花－神渡", "4–5", "約90分鐘", 4, 4, "台北市", "higanbana"],
  ].map(([name, players, duration, horror, brain, city, key]) => ({ name, venue_name: "FUNLOCK 放樂工作室", city, district: "中山／西區", google_rating: 4.9, rating_scope: "店家／分店級 Google 評價（Places API 代理資料）", players, duration, horror, brain, styles: horror >= 4 ? ["恐怖驚悚", "沉浸劇情"] : ["機關解謎", "沉浸劇情"], booking_url: source[key], source_urls: [source[key]], google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）" })),
  ...[
    ["屍變", "2–6", "待核對", 5, 3], ["法老", "待核對", "待核對", 2, 3], ["觀落陰", "待核對", "待核對", 5, 4],
  ].map(([name, players, duration, horror, brain]) => ({ name, venue_name: "Miss GAME 密室逃脫", city: "台北市", district: "西門／大直／松江南京", google_rating: 4.9, rating_scope: "店家／分店級 Google 評價（Places API 代理資料）", players, duration, horror, brain, styles: horror >= 4 ? ["恐怖驚悚", "真人互動"] : ["機關解謎", "沉浸劇情"], booking_url: source.missgame, source_urls: [source.missgame], google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）" })),
  ...[
    ["美夢｜咒雨", "3–6", "待核對", 4, 3], ["惡夢｜安雅", "6–10", "待核對", 5, 3], ["惡夢｜籠中鳥", "6–10", "待核對", 4, 3], ["偵探夢｜抓狂首映會", "10", "待核對", 1, 4], ["明星夢｜偶像出道", "6–10", "待核對", 1, 3], ["極恐惡夢｜INSANE", "4–8", "待核對", 5, 3], ["玩偶之家 Dolls’ House", "6–8", "待核對", 3, 3],
  ].map(([name, players, duration, horror, brain]) => ({ name, venue_name: "夢遊王國", city: "台北市", district: "大同／萬華", google_rating: 5, rating_scope: "店家／分店級 Google 評價（Places API 代理資料）", players, duration, horror, brain, styles: horror >= 4 ? ["恐怖驚悚", "沉浸劇情"] : ["沉浸劇情", "機關解謎"], booking_url: source.dream, source_urls: [source.dream], google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）" })),
  ...[
    ["絕命旅舍", 5], ["嬰魂嚇水道", 5], ["異形覆沒", 2], ["法老謎城", 2], ["奪魂獄", 4],
  ].map(([name, horror]) => ({ name, venue_name: "Mystoto Escape Games", city: "高雄市", district: "苓雅", google_rating: 5, rating_scope: "店家／分店級 Google 評價（Places API 代理資料）", players: "4–8", duration: "60分鐘", horror, brain: 4, styles: horror >= 4 ? ["恐怖驚悚", "機關解謎"] : ["機關解謎", "沉浸劇情"], booking_url: source.mystoto, source_urls: [source.mystoto], google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）" })),
  ...[
    ["櫻花暖居", "西門成都店"], ["夜蒐樓靜", "西門成都店"], ["醉後一杯", "西門成都店"], ["黑暗倒影", "西門成都店"], ["嬰聲", "西門成都店"], ["富得誰負", "西門中華店"], ["櫻之雪", "西門中華店"], ["罪夢真相", "西門中華店"],
  ].map(([name, branch]) => ({ name, venue_name: `Througher 穿越者｜${branch}`, city: "台北市", district: "萬華", google_rating: 5, rating_scope: "店家／分店級 Google 評價（Places API 代理資料）", players: "2–8", duration: "60分鐘", horror: ["夜蒐樓靜", "黑暗倒影", "嬰聲", "罪夢真相"].includes(name) ? 4 : 2, brain: 4, styles: ["機關解謎", "沉浸劇情"], booking_url: source.througher, source_urls: [source.througher], google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）" })),
  ...[
    ["等一個人‧盜墓", "2–8", "80分鐘", 3], ["這個Case有點Big", "2–6", "80分鐘", 1], ["利維德酒吧", "4–8", "160分鐘", 1],
  ].map(([name, players, duration, horror]) => ({ name, venue_name: "LoGin 登入密室逃脫", city: "新北市", district: "中和", google_rating: 5, rating_scope: "店家／分店級 Google 評價（Places API 代理資料）", players, duration, horror, brain: 4, styles: ["沉浸劇情", "機關解謎"], booking_url: source.login, source_urls: [source.login], google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）" })),
  ...[
    ["三更", "鎮冥工作室", "台中市", "大里區", "6–8", "約150分鐘", 5, 3, "zhenming"],
    ["誕生", "百室達密室脫逃", "台中市", "大里區", "4–8", "約120分鐘", 4, 3, "baishida"],
    ["鬼不語", "山裏工作室", "台中市", "太平區", "3–6", "約120–150分鐘", 5, 4, "shanli"],
    ["LINA", "梅林的鬍子遊戲工作室", "宜蘭市", "二館｜昇平街", "4–6", "約120分鐘", 3, 4, "merlins"],
    ["巷仔口", "梅林的鬍子遊戲工作室", "宜蘭市", "二館｜昇平街", "4–6", "約120分鐘", 2, 3, "merlins"],
    ["陰緣", "梅林的鬍子遊戲工作室", "宜蘭市", "本館｜康樂路", "4–8", "約120分鐘", 4, 3, "merlins"],
    ["花見小路", "梅林的鬍子遊戲工作室", "宜蘭市", "本館｜康樂路", "3–5", "約60–90分鐘", 1, 3, "merlins"],
    ["聖劍騎士", "梅林的鬍子遊戲工作室", "宜蘭市", "本館｜康樂路", "6–10", "約90分鐘", 1, 3, "merlins"],
    ["荒村小學", "塊陶阿工作室", "桃園市", "中壢店", "4–9", "90分鐘", 4, 3, "kuaitaoa"],
    ["見鬼十法", "塊陶阿工作室", "台北市", "晴光店｜中山", "4–8", "90分鐘", 4, 3, "kuaitaoa"],
  ].map(([name, venue_name, city, district, players, duration, horror, brain, key]) => ({ name, venue_name, city, district, google_rating: null, rating_scope: "官方主題資料與公開來源精選；未採用未核實的數字評價", players, duration, horror, brain, styles: horror >= 4 ? ["恐怖驚悚", "沉浸式演繹"] : ["機關解謎", "沉浸式演繹"], booking_url: source[key], source_urls: [source[key]], google_rating_scope: "未採用數字評價" })),
];

const escer = [
  ["森林之心", "4–8", 2], ["霸王", "4–8", 2], ["審判者", "2–4", 2], ["盜義有道", "4–8", 2], ["小小鎮", "2–4", 1], ["是不是勇者", "4–8", 1], ["邪咒曲", "4–8", 4], ["輪迴", "2–8", 3], ["窒愛", "2–8", 4], ["詭鄰驚怪", "4–8", 4], ["弗瑞克樂園", "4–8", 2], ["消失的聖誕禮物", "2–6", 1], ["車諾比事件", "2–6", 2], ["愛麗絲仙境", "2–6", 1], ["越獄逃生", "2–6", 2], ["恐懼聖所", "2–6", 5], ["噬魂之夜", "2–4", 5], ["惡靈詛咒", "2–4", 5], ["叢林探險", "2–6", 1], ["喋血病院", "2–4", 5], ["拆解核危機", "2–6", 2], ["賽博龐克", "2–6", 2], ["夢境駭客Ⅰ", "2–4", 2], ["夢境駭客Ⅱ", "2–4", 2], ["夢境駭客Ⅲ", "2–4", 2], ["暗影潛行", "4–8", 3], ["獄門神社", "4–8", 5],
].map(([name, players, horror]) => ({ name, venue_name: "Escer 異世客", city: "台中市", district: "南區／北區／西屯", google_rating: 5, rating_scope: "店家／分店級 Google 評價（Places API 代理資料）", players, duration: name === "暗影潛行" || name === "獄門神社" ? "120分鐘" : "60分鐘", horror, brain: name.includes("VR") ? 2 : 4, styles: horror >= 4 ? ["恐怖驚悚", "機關解謎"] : ["機關解謎", "VR密室"], booking_url: source.escer, source_urls: [source.escer], google_rating_scope: "店家／分店級 Google 評價（Places API 代理資料）" }));
rows.push(...escer);

const seen = new Set(topics.map((topic) => `${topic.venue_name}::${topic.name}`));
const additions = rows.filter((topic) => !seen.has(`${topic.venue_name}::${topic.name}`)).map((topic, index) => ({
  id: `popular-${String(topics.length + index + 1).padStart(3, "0")}`,
  ...topic,
  pros: ["官方主題頁可核對現行資訊", "可與全台其他主題直接比較"],
  cons: ["評分為店家／分店級代理", "預約前請核對最新檔期"],
}));
const next = [...topics, ...additions];
await fs.writeFile(file, JSON.stringify(next, null, 2) + "\n");
console.log(JSON.stringify({ before: topics.length, candidates: rows.length, added: additions.length, after: next.length }, null, 2));
