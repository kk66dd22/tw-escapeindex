import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/venues.json");
const venues = JSON.parse(await fs.readFile(file, "utf8"));

const venue = ({ id, name, city, region, district, address, website, themes, source_urls, note }) => ({
  id,
  name,
  city,
  region,
  district,
  address,
  website,
  booking_url: website,
  google_rating: null,
  rating_source: "尚未採用未核實的數字評價",
  rating_checked_at: "2026-09-06",
  rating_note: note,
  themes: themes.map((theme) => ({
    ...theme,
    release_time: Object.hasOwn(theme, "release_time") ? theme.release_time : null,
  })),
  pros: ["官方主題資料可查", "主題玩法與城市分類已整理"],
  cons: ["熱門時段建議提早確認", "正式預約前請以店家最新公告為準"],
  source_urls,
  last_source_fetch: "2026-09-06",
  google_rating_scope: "未採用數字評價",
});

const additions = [
  venue({
    id: "zhenming-taichung",
    name: "鎮冥工作室",
    city: "台中市",
    region: "中部",
    district: "大里區",
    address: "台中市大里區國光路二段500號12樓（以官方最新預約資訊為準）",
    website: "https://www.instagram.com/sangeng.escaqe/",
    themes: [{ name: "三更", players: "6–8", horror: 5, brain: 3, styles: ["恐怖驚悚", "沉浸式演繹", "追逐體驗"] }],
    source_urls: ["https://escape.bar/game/26477", "https://escape.bar/firm/26465", "https://www.instagram.com/sangeng.escaqe/"],
    note: "官方社群與公開主題頁交叉核對；未填入店家數字評價。",
  }),
  venue({
    id: "baishida-taichung",
    name: "百室達密室脫逃",
    city: "台中市",
    region: "中部",
    district: "大里區",
    address: "台中市大里區國光路二段500號11樓之2（以官方最新預約資訊為準）",
    website: "https://baishidaescape.simplybook.asia/v2/",
    themes: [{ name: "誕生", players: "4–8", horror: 4, brain: 3, styles: ["恐怖驚悚", "泰式恐怖", "沉浸式演繹", "追逐體驗"] }],
    source_urls: ["https://escape.bar/game/26907", "https://escape.bar/firm/26898", "https://www.instagram.com/baishida_escape/", "https://baishidaescape.simplybook.asia/v2/"],
    note: "公開主題頁、官方社群與預約平台交叉核對；預約頁需以最新場次為準。",
  }),
  venue({
    id: "shanli-taichung",
    name: "山裏工作室",
    city: "台中市",
    region: "中部",
    district: "太平區",
    address: "台中市太平區（以官方最新預約資訊為準）",
    website: "https://www.instagram.com/mountain111_escape/",
    themes: [{ name: "鬼不語", players: "3–6", horror: 5, brain: 4, styles: ["恐怖驚悚", "沉浸式演繹", "高難度解謎", "單線任務"] }],
    source_urls: ["https://escape.bar/game/26864", "https://www.instagram.com/mountain111_escape/"],
    note: "官方社群與公開主題頁交叉核對；地址詳細度以店家最新公告為準。",
  }),
  venue({
    id: "merlins-beard-yilan",
    name: "梅林的鬍子遊戲工作室",
    city: "宜蘭市",
    region: "東部",
    district: "本館／二館",
    address: "本館：宜蘭市康樂路61號；二館：宜蘭市昇平街24號2樓",
    website: "https://www.yilanmerlinsbeard.com/",
    themes: [
      { name: "LINA", players: "4–6", horror: 3, brain: 4, styles: ["歐美風格", "微恐懸疑", "沉浸式演繹"] },
      { name: "巷仔口", players: "4–6", horror: 2, brain: 3, styles: ["民國懷舊", "懸疑推理", "機關解謎"] },
      { name: "陰緣", players: "4–8", horror: 4, brain: 3, styles: ["恐怖驚悚", "台灣民俗", "角色扮演"] },
      { name: "花見小路", players: "3–5", horror: 1, brain: 3, styles: ["日式風格", "新手小品", "解謎探索"] },
      { name: "聖劍騎士", players: "6–10", horror: 1, brain: 3, styles: ["奇幻冒險", "角色扮演", "多人協作"] },
    ],
    source_urls: ["https://www.yilanmerlinsbeard.com/", "https://beardyilan.com/alley/", "https://beardyilan.com/ghostmarriage/", "https://beardyilan.com/flower/", "https://beardyilan.com/sword/"],
    note: "官方網站確認本館／二館與五款原創主題；未填入未即時核實的店家數字評價。",
  }),
  venue({
    id: "kuaitaoa-taoyuan",
    name: "塊陶阿工作室",
    city: "桃園市",
    region: "北部",
    district: "中壢店",
    address: "桃園市中壢區環中東路二段516號6樓",
    website: "https://www.kuaitaoa.cc/",
    themes: [{ name: "荒村小學", players: "4–9", horror: 4, brain: 3, styles: ["校園怪談", "驚悚恐怖", "NPC互動"] }],
    source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/荒村小學/"],
    note: "官方網站明確列為桃園中壢店主題；見鬼十法屬台北晴光店，不歸入桃園。",
  }),
  venue({
    id: "kuaitaoa-taipei-qingguang",
    name: "塊陶阿工作室",
    city: "台北市",
    region: "北部",
    district: "晴光店｜中山",
    address: "台北市中山區新生北路三段82巷37號地下一樓",
    website: "https://www.kuaitaoa.cc/",
    themes: [
      { name: "見鬼十法", players: "4–8", horror: 4, brain: 3, styles: ["試膽體驗", "驚悚恐怖", "NPC互動"] },
      { name: "醫怨", players: "4–8", horror: 4, brain: 3, styles: ["恐怖驚悚", "NPC互動", "試膽體驗"] },
      { name: "詐屍", players: "3–8", horror: 4, brain: 3, styles: ["驚悚恐怖", "NPC互動", "機關解謎"] },
      { name: "塊陶格子360", players: "待核對", horror: 2, brain: 3, styles: ["機關解謎", "趣味互動"] },
      { name: "塊陶雷射", players: "待核對", horror: 1, brain: 3, styles: ["機關解謎", "雷射挑戰"] },
    ],
    source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/見鬼十法/", "https://www.kuaitaoa.cc/醫怨/", "https://www.kuaitaoa.cc/product/詐屍/", "https://www.kuaitaoa.cc/塊陶格子360/", "https://www.kuaitaoa.cc/塊陶雷射/"],
    note: "官方網站明確列為台北晴光店主題，未誤分類到桃園；新增主題未填入未核實的數字評價。",
  }),
  venue({
    id: "a5-taoyuan-station",
    name: "A5 Studio 實境密室逃脫",
    city: "桃園市",
    region: "北部",
    district: "桃園站前店",
    address: "桃園市桃園區中華路3號11樓",
    website: "https://www.a5-studio.com.tw/",
    themes: [
      { name: "草鳴村怪談", players: "4–5", duration: "70分鐘", horror: 4, brain: 3, styles: ["日式恐怖", "新手入門"] },
      { name: "冥婚", players: "2–5", duration: "100分鐘", horror: 4, brain: 3, styles: ["民俗恐怖", "沉浸演繹"] },
      { name: "44廳逝世廳", players: "4–8", duration: "100分鐘", horror: 3, brain: 3, styles: ["陣營對戰", "沉浸演繹"] },
      { name: "殛時", players: "2–5", duration: "90分鐘", horror: 3, brain: 3, styles: ["劇情解謎", "民俗傳說"] },
      { name: "殛時+冥婚", players: "4–5", duration: "140分鐘", horror: 5, brain: 3, styles: ["連刷體驗", "恐怖劇情"] },
      { name: "第九夜", players: "4–6", duration: "110分鐘", horror: 4, brain: 4, styles: ["虐心劇情", "驚悚懸疑"] },
      { name: "山中小屋藏身處", players: "3–6", duration: "100分鐘", horror: 3, brain: 4, styles: ["驚悚懸疑", "新手推薦"] },
    ],
    source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://www.a5studio.com.tw/"],
    note: "A5 官方主題頁與首頁確認桃園站前店分館及主題；未填入未核實的數字評價。",
  }),
  venue({
    id: "a5-taoyuan-zhongli",
    name: "A5 Studio 實境密室逃脫",
    city: "桃園市",
    region: "北部",
    district: "中壢中原店",
    address: "桃園市中壢區中北路二段434號8樓",
    website: "https://www.a5-studio.com.tw/",
    themes: [
      { name: "鬱金香", players: "4–6", duration: "100分鐘", horror: 2, brain: 4, styles: ["電影場景", "NPC互動"] },
      { name: "賊-十載春秋", players: "4–8", duration: "100分鐘", horror: 1, brain: 4, styles: ["中國古風", "盜賊體驗"] },
      { name: "奎蕾精神病院", players: "3–6", duration: "90分鐘", horror: 4, brain: 3, styles: ["驚悚懸疑", "新手推薦"] },
      { name: "殭局", players: "4–6", duration: "120分鐘", horror: 5, brain: 3, styles: ["香港血案", "恐怖寫實"] },
      { name: "理髮師陶德卡特", players: "5–8", duration: "120分鐘", horror: 2, brain: 4, styles: ["感人劇情", "英國工業風"] },
    ],
    source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://www.a5studio.com.tw/"],
    note: "A5 官方主題頁與首頁確認中壢中原店分館及主題；未填入未核實的數字評價。",
  }),
  venue({
    id: "missstudio-shanzi",
    name: "謎失工作室",
    city: "桃園市",
    region: "北部",
    district: "山子頂店",
    address: "桃園市山子頂店（詳細地址依官方最新公告）",
    website: "https://www.missstudio.design/",
    themes: [
      { name: "失物招領", players: "2–4", horror: 3, brain: 3, styles: ["校園懸疑", "恐怖氛圍"] },
      { name: "301號房", players: "2–4", horror: 3, brain: 3, styles: ["旅社懸疑", "異樣氛圍"] },
    ],
    source_urls: ["https://www.missstudio.design/", "https://missstudio.simplybook.asia/v2/", "https://escape.bar/firm/10282"],
    note: "謎失官方網站確認桃園山子頂店與兩款主題；地址詳細度以官方最新公告為準。",
  }),
  venue({
    id: "missstudio-zhongli",
    name: "謎失工作室",
    city: "桃園市",
    region: "北部",
    district: "中壢店",
    address: "桃園市中壢店（詳細地址依官方最新公告）",
    website: "https://www.missstudio.design/",
    themes: [
      { name: "藝樣的代價", players: "2–6", horror: 2, brain: 4, styles: ["怪盜任務", "攀爬體驗"] },
      { name: "朱砂", players: "2–6", horror: 2, brain: 4, styles: ["懸疑推理", "微驚悚"] },
    ],
    source_urls: ["https://www.missstudio.design/", "https://missstudio.simplybook.asia/v2/"],
    note: "謎失官方網站確認桃園中壢店與兩款主題；地址詳細度以官方最新公告為準。",
  }),
  venue({
    id: "darkfile-zhongli",
    name: "闇間工作室",
    city: "桃園市",
    region: "北部",
    district: "中壢店",
    address: "桃園市中壢區環北路400號3樓之1",
    website: "https://darkfileescape.com/",
    themes: [
      { name: "伴", players: "待核對", horror: 1, brain: 3, styles: ["溫馨浪漫", "求婚客製"] },
      { name: "怨憶", players: "待核對", horror: 5, brain: 4, styles: ["恐怖驚悚", "多人合作", "身歷其境"] },
      { name: "康樂保衛戰", players: "待核對", horror: 1, brain: 3, styles: ["陣營遊戲", "機關操作", "多人派對"] },
    ],
    source_urls: ["https://darkfileescape.com/", "https://darkfileescape.boostime.me/activities/couple", "https://darkfileescape.boostime.me/activities/resentmemory", "https://darkfileescape.boostime.me/activities/colondefense"],
    note: "闇間官方網站確認中壢店地址與三款主題；未填入未核實的人數、時間與數字評價。",
  }),
  venue({
    id: "joinplay-luodong",
    name: "揪揪玩密室逃脫",
    city: "宜蘭市",
    region: "東部",
    district: "羅東鎮｜中華路",
    address: "宜蘭縣羅東鎮中華路（詳細地址依官方預約資訊）",
    website: "https://joinplay.com.tw/",
    themes: [{ name: "寶寶睡", players: "2–6", duration: "90分鐘", horror: 3, brain: 3, styles: ["沉浸演繹", "恐怖懸疑", "團隊合作"] }],
    source_urls: ["https://joinplay.com.tw/", "https://joinplay.boostime.me/activities/cnrotssg", "https://escape.bar/game/25384"],
    note: "揪揪玩官方網站確認宜蘭羅東品牌與寶寶睡主題；公開資料未核實其他現行主題，不額外推測。",
  }),
];

const next = [...venues];
for (const item of additions) {
  const existingIndex = next.findIndex((venue) => venue.id === item.id);
  if (existingIndex < 0) {
    next.push(item);
    continue;
  }
  const current = next[existingIndex];
  const existingThemeNames = new Set((current.themes ?? []).map((theme) => theme.name));
  const mergedThemes = [...(current.themes ?? [])];
  for (const theme of item.themes ?? []) {
    if (!existingThemeNames.has(theme.name)) mergedThemes.push(theme);
  }
  next[existingIndex] = {
    ...current,
    ...item,
    themes: mergedThemes,
    source_urls: [...new Set([...(current.source_urls ?? []), ...(item.source_urls ?? [])])],
  };
}

await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ before: venues.length, candidates: additions.length, after: next.length, added: next.length - venues.length }, null, 2));
