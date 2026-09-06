import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const file = path.join(root, "data/topics.json");
const topics = JSON.parse(await fs.readFile(file, "utf8"));

const topic = ({
  id,
  name,
  venue_name,
  city,
  district,
  players,
  duration,
  horror,
  brain,
  styles,
  source_urls,
  story_summary,
  story_summary_source_excerpt,
  rating_scope = "未採用未核實的數字評價；依官方主題資料與公開來源精選",
}) => ({
  id,
  name,
  venue_name,
  city,
  district,
  google_rating: null,
  rating_scope,
  players,
  duration,
  horror,
  brain,
  styles,
  booking_url: source_urls[0],
  source_urls,
  google_rating_scope: "未採用數字評價",
  pros: ["場景營造具沉浸感", "謎題與劇情具挑戰性"],
  cons: ["熱門時段建議提早確認"],
  data_quality: "official_topic_page_plus_public_cross_check",
  duration_source: "官方主題頁或官方預約資訊",
  editorial_scale_scope: "編輯部導覽分級；非官方難度或玩家評分",
  editorial_scale_note: "恐怖／燒腦為編輯部 1–5 導覽分級，依官方主題描述與公開主題資料整理；不代表官方標示或玩家評分。",
  story_summary,
  story_summary_provenance: "official_topic_page_plus_public_cross_check",
  story_summary_source_urls: source_urls,
  story_summary_note: "此為導覽摘要，僅依官方主題資料與公開來源整理；人數、時間與場次依官網公告。",
  story_summary_source_excerpt,
  tag_provenance: "editorial_tags_based_on_public_topic_descriptions",
  tag_provenance_note: "導覽標籤依官方主題描述與公開資料整理；不代表玩家實測心得或官方承諾。",
});

const additions = [
  topic({
    id: "popular-115",
    name: "三更",
    venue_name: "鎮冥工作室",
    city: "台中市",
    district: "大里區",
    players: "6–8",
    duration: "約150分鐘",
    horror: 5,
    brain: 3,
    styles: ["恐怖驚悚", "沉浸式演繹", "中式恐怖", "追逐體驗"],
    source_urls: ["https://escape.bar/game/26477", "https://escape.bar/firm/26465", "https://www.instagram.com/sangeng.escaqe/"],
    story_summary: "《三更》以中式恐怖與沉浸式演繹打造大型迷宮體驗，玩家在黑暗與追逐壓力中逐步完成任務。",
    story_summary_source_excerpt: "官方社群與公開主題資料將《三更》描述為大型黑追迷宮類中式沉浸式恐怖密室。",
  }),
  topic({
    id: "popular-116",
    name: "誕生",
    venue_name: "百室達密室脫逃",
    city: "台中市",
    district: "大里區",
    players: "4–8",
    duration: "約120分鐘",
    horror: 4,
    brain: 3,
    styles: ["恐怖驚悚", "泰式恐怖", "沉浸式演繹", "追逐體驗"],
    source_urls: ["https://escape.bar/game/26907", "https://escape.bar/firm/26898", "https://www.instagram.com/baishida_escape/", "https://baishidaescape.simplybook.asia/v2/"],
    story_summary: "《誕生》以泰式恐怖傳說為核心，結合沉浸演繹與追逐段落，並讓隊伍在高壓情境中完成各自任務。",
    story_summary_source_excerpt: "公開主題資料與官方社群交叉描述《誕生》為泰式恐怖、沉浸演繹與大型追逐主題。",
  }),
  topic({
    id: "popular-117",
    name: "鬼不語",
    venue_name: "山裏工作室",
    city: "台中市",
    district: "太平區",
    players: "3–6",
    duration: "約120–150分鐘",
    horror: 5,
    brain: 4,
    styles: ["恐怖驚悚", "沉浸式演繹", "高難度解謎", "單線任務"],
    source_urls: ["https://escape.bar/game/26864", "https://www.instagram.com/mountain111_escape/"],
    story_summary: "《鬼不語》以高密度題海與恐怖氛圍推進劇情，隊伍需要在單線任務節奏中協作拆解線索。",
    story_summary_source_excerpt: "公開主題資料與官方社群確認《鬼不語》為山裏工作室的恐怖密室主題，具沉浸演繹與高壓解謎特色。",
  }),
  topic({
    id: "popular-118",
    name: "LINA",
    venue_name: "梅林的鬍子遊戲工作室",
    city: "宜蘭市",
    district: "二館｜昇平街",
    players: "4–6",
    duration: "約120分鐘",
    horror: 3,
    brain: 4,
    styles: ["歐美風格", "微恐懸疑", "沉浸式演繹", "機關解謎"],
    source_urls: ["https://www.yilanmerlinsbeard.com/", "https://tinybot.cc/beardyilan/product/lina%e4%ba%8c%e9%a4%a8/?opc=1&display=1", "https://bewithnene.tw/lina/"],
    story_summary: "《LINA》是梅林二館的歐美微恐原創主題，以沉浸演繹與機關探索帶隊伍穿梭多重空間。",
    story_summary_source_excerpt: "官方網站將 LINA 標示為全新主題；公開主題資料提到微恐、NPC 與穿透式演繹。",
  }),
  topic({
    id: "popular-119",
    name: "巷仔口",
    venue_name: "梅林的鬍子遊戲工作室",
    city: "宜蘭市",
    district: "二館｜昇平街",
    players: "4–6",
    duration: "約120分鐘",
    horror: 2,
    brain: 3,
    styles: ["民國懷舊", "懸疑推理", "沉浸式演繹", "機關解謎"],
    source_urls: ["https://www.yilanmerlinsbeard.com/", "https://beardyilan.com/alley/", "https://escape.bar/game/17377", "https://bewithnene.tw/alley-entrance/"],
    story_summary: "《巷仔口》以宜蘭街景與民國懷舊氛圍包裹推理解謎，適合喜歡場景細節與故事探索的隊伍。",
    story_summary_source_excerpt: "官方頁面將巷仔口列為二館主題；公開主題資料描述其為懷舊風格與推理解謎作品。",
    rating_scope: "EscapeBar 公開主題評價與官方原創主題資料；本站不將其轉作店家評分",
  }),
  topic({
    id: "popular-120",
    name: "陰緣",
    venue_name: "梅林的鬍子遊戲工作室",
    city: "宜蘭市",
    district: "本館｜康樂路",
    players: "4–8",
    duration: "約120分鐘",
    horror: 4,
    brain: 3,
    styles: ["恐怖驚悚", "台灣民俗", "沉浸式演繹", "角色扮演"],
    source_urls: ["https://www.yilanmerlinsbeard.com/", "https://beardyilan.com/ghostmarriage/", "https://bewithnene.tw/yilanmerlinsbeard-ghostmarriage/"],
    story_summary: "《陰緣》以台灣民俗與角色扮演營造恐怖沉浸感，讓隊伍在故事與任務交錯中追查陰影裡的線索。",
    story_summary_source_excerpt: "官方網站列出陰緣為梅林主題；公開主題資料將其描述為恐怖、民俗與沉浸演繹作品。",
  }),
  topic({
    id: "popular-121",
    name: "花見小路",
    venue_name: "梅林的鬍子遊戲工作室",
    city: "宜蘭市",
    district: "本館｜康樂路",
    players: "3–5",
    duration: "約60–90分鐘",
    horror: 1,
    brain: 3,
    styles: ["日式風格", "新手小品", "解謎探索", "機關解謎"],
    source_urls: ["https://www.yilanmerlinsbeard.com/", "https://beardyilan.com/flower/", "https://bewithnene.tw/hanamikoji/"],
    story_summary: "《花見小路》以日式唯美場景承載精緻小品解謎，適合想從較輕盈節奏開始探索宜蘭密室的玩家。",
    story_summary_source_excerpt: "官方網站列出花見小路為本館主題；公開主題資料描述其為日式唯美小品，最低 3 人可玩。",
  }),
  topic({
    id: "popular-122",
    name: "聖劍騎士",
    venue_name: "梅林的鬍子遊戲工作室",
    city: "宜蘭市",
    district: "本館｜康樂路",
    players: "6–10",
    duration: "約90分鐘",
    horror: 1,
    brain: 3,
    styles: ["奇幻冒險", "角色扮演", "多人協作", "機關解謎"],
    source_urls: ["https://www.yilanmerlinsbeard.com/", "https://beardyilan.com/sword/", "https://roger5050.pixnet.net/blog/posts/15176346795"],
    story_summary: "《聖劍騎士》以奇幻冒險與多人角色扮演串起機關解謎，適合團體一起投入任務與故事。",
    story_summary_source_excerpt: "官方網站列出聖劍騎士為本館主題；公開主題資料描述其為奇幻冒險與多人團體向作品。",
  }),
  topic({
    id: "popular-123",
    name: "荒村小學",
    venue_name: "塊陶阿工作室",
    city: "桃園市",
    district: "中壢店",
    players: "4–9",
    duration: "90分鐘",
    horror: 4,
    brain: 3,
    styles: ["校園怪談", "驚悚恐怖", "NPC互動", "追逐體驗"],
    source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/荒村小學/"],
    story_summary: "《荒村小學》是塊陶阿桃園中壢店的校園怪談主題，以驚悚場景與互動演出帶隊伍找出荒村校舍的秘密。",
    story_summary_source_excerpt: "官方首頁將荒村小學列為桃園中壢店主題，並明示 90 分鐘、4–9 人。",
  }),
  topic({
    id: "popular-124",
    name: "見鬼十法",
    venue_name: "塊陶阿工作室",
    city: "台北市",
    district: "晴光店｜中山",
    players: "4–8",
    duration: "90分鐘",
    horror: 4,
    brain: 3,
    styles: ["試膽體驗", "驚悚恐怖", "NPC互動", "單線任務"],
    source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/見鬼十法/"],
    story_summary: "《見鬼十法》是塊陶阿晴光店的驚悚主題，以試膽與互動演出推進一段高壓單線任務。",
    story_summary_source_excerpt: "官方首頁將見鬼十法列為台北晴光店主題，並明示 90 分鐘、4–8 人；本筆不歸入桃園。",
  }),
  topic({
    id: "popular-125", name: "醫怨", venue_name: "塊陶阿工作室", city: "台北市", district: "晴光店｜中山", players: "4–8", duration: "90分鐘", horror: 4, brain: 3,
    styles: ["恐怖驚悚", "NPC互動", "試膽體驗"], source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/醫怨/", "https://escape.bar/game/25435"],
    story_summary: "《醫怨》是塊陶阿晴光店的恐怖主題，透過醫療場景與互動任務推進高壓解謎。", story_summary_source_excerpt: "官方主題頁與公開遊戲頁列出醫怨為晴光店主題，並標示 90 分鐘、4–8 人。"
  }),
  topic({
    id: "popular-126", name: "詐屍", venue_name: "塊陶阿工作室", city: "台北市", district: "晴光店｜中山", players: "3–8", duration: "70分鐘", horror: 4, brain: 3,
    styles: ["驚悚恐怖", "NPC互動", "機關解謎"], source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/product/詐屍/", "https://escape.bar/game/27298"],
    story_summary: "《詐屍》以短時段高壓恐怖與互動機關為主，適合想體驗驚悚密室的隊伍。", story_summary_source_excerpt: "官方主題頁與公開遊戲頁列出詐屍為晴光店主題，並標示 70 分鐘、3–8 人。"
  }),
  topic({
    id: "popular-127", name: "塊陶格子360", venue_name: "塊陶阿工作室", city: "台北市", district: "晴光店｜中山", players: "依官網公告", duration: "依官網公告", horror: 2, brain: 3,
    styles: ["機關解謎", "趣味互動"], source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/塊陶格子360/"],
    story_summary: "《塊陶格子360》是塊陶阿晴光店的機關互動型主題，完整人數與場次以官方最新公告為準。", story_summary_source_excerpt: "官方網站列出塊陶格子360為塊陶阿主題；公開頁面未穩定提供本批所需的人數與時間。"
  }),
  topic({
    id: "popular-128", name: "塊陶雷射", venue_name: "塊陶阿工作室", city: "台北市", district: "晴光店｜中山", players: "依官網公告", duration: "依官網公告", horror: 1, brain: 3,
    styles: ["機關解謎", "雷射挑戰"], source_urls: ["https://www.kuaitaoa.cc/", "https://www.kuaitaoa.cc/塊陶雷射/"],
    story_summary: "《塊陶雷射》是塊陶阿晴光店的機關挑戰型主題，完整人數與場次以官方最新公告為準。", story_summary_source_excerpt: "官方網站列出塊陶雷射為塊陶阿主題；公開頁面未穩定提供本批所需的人數與時間。"
  }),
  topic({
    id: "popular-129", name: "草鳴村怪談", venue_name: "A5 Studio 實境密室逃脫｜桃園站前店", city: "桃園市", district: "桃園站前店", players: "4–5", duration: "70分鐘", horror: 4, brain: 3,
    styles: ["日式恐怖", "新手入門"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/GrassVillage"],
    story_summary: "《草鳴村怪談》以日式恐怖與清楚的入門節奏，帶玩家探索桃園站前店的怪談場景。", story_summary_source_excerpt: "A5 官方主題頁列出草鳴村怪談為桃園站前店主題，70 分鐘、4–5 人。"
  }),
  topic({
    id: "popular-130", name: "冥婚", venue_name: "A5 Studio 實境密室逃脫｜桃園站前店", city: "桃園市", district: "桃園站前店", players: "2–5", duration: "100分鐘", horror: 4, brain: 3,
    styles: ["民俗恐怖", "沉浸演繹"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/marry"],
    story_summary: "《冥婚》以民俗禁忌與陰錯陽差的劇情推進沉浸式恐怖體驗。", story_summary_source_excerpt: "A5 官方主題頁列出冥婚為桃園站前店主題，100 分鐘、2–5 人。"
  }),
  topic({
    id: "popular-131", name: "44廳逝世廳", venue_name: "A5 Studio 實境密室逃脫｜桃園站前店", city: "桃園市", district: "桃園站前店", players: "4–8", duration: "100分鐘", horror: 3, brain: 3,
    styles: ["陣營對戰", "沉浸演繹"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/TheDeathofCinema"],
    story_summary: "《44廳逝世廳》以陰間角色陣營對戰結合沉浸演繹，讓隊伍在陣營目標中完成任務。", story_summary_source_excerpt: "A5 官方主題頁列出 44 廳逝世廳為桃園站前店主題，100 分鐘、4–8 人。"
  }),
  topic({
    id: "popular-132", name: "殛時", venue_name: "A5 Studio 實境密室逃脫｜桃園站前店", city: "桃園市", district: "桃園站前店", players: "2–5", duration: "90分鐘", horror: 3, brain: 3,
    styles: ["劇情解謎", "民俗傳說"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/goodday"],
    story_summary: "《殛時》以峰迴路轉的劇情與良辰吉時意象，帶玩家完成一段桃園站前店的故事解謎。", story_summary_source_excerpt: "A5 官方主題頁列出殛時為桃園站前店主題，90 分鐘、2–5 人。"
  }),
  topic({
    id: "popular-133", name: "殛時+冥婚", venue_name: "A5 Studio 實境密室逃脫｜桃園站前店", city: "桃園市", district: "桃園站前店", players: "4–5", duration: "140分鐘", horror: 5, brain: 3,
    styles: ["連刷體驗", "恐怖劇情"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/cheap"],
    story_summary: "《殛時+冥婚》將前傳與正傳連刷，讓玩家不中斷地體驗完整民俗恐怖故事。", story_summary_source_excerpt: "A5 官方主題頁列出殛時+冥婚為桃園站前店連刷主題，140 分鐘、4–5 人。"
  }),
  topic({
    id: "popular-134", name: "第九夜", venue_name: "A5 Studio 實境密室逃脫｜桃園站前店", city: "桃園市", district: "桃園站前店", players: "4–6", duration: "110分鐘", horror: 4, brain: 4,
    styles: ["虐心劇情", "驚悚懸疑"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/nekomata"],
    story_summary: "《第九夜》以虐心劇情與懸疑節奏推進桃園站前店的驚悚體驗。", story_summary_source_excerpt: "A5 官方主題頁列出第九夜為桃園站前店主題，110 分鐘、4–6 人。"
  }),
  topic({
    id: "popular-135", name: "山中小屋藏身處", venue_name: "A5 Studio 實境密室逃脫｜桃園站前店", city: "桃園市", district: "桃園站前店", players: "3–6", duration: "100分鐘", horror: 3, brain: 4,
    styles: ["驚悚懸疑", "新手推薦"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/hut"],
    story_summary: "《山中小屋藏身處》以驚悚懸疑與較友善的入門節奏，展開桃園站前店的山屋故事。", story_summary_source_excerpt: "A5 官方主題頁列出山中小屋藏身處為桃園站前店主題，100 分鐘、3–6 人。"
  }),
  topic({
    id: "popular-136", name: "鬱金香", venue_name: "A5 Studio 實境密室逃脫｜中壢中原店", city: "桃園市", district: "中壢中原店", players: "4–6", duration: "100分鐘", horror: 2, brain: 4,
    styles: ["電影場景", "NPC互動"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/TheTulip"],
    story_summary: "《鬱金香》以電影場景與 NPC 互動打造中壢中原店的沉浸式故事。", story_summary_source_excerpt: "A5 官方主題頁列出鬱金香為中壢中原店主題，100 分鐘、4–6 人。"
  }),
  topic({
    id: "popular-137", name: "賊-十載春秋", venue_name: "A5 Studio 實境密室逃脫｜中壢中原店", city: "桃園市", district: "中壢中原店", players: "4–8", duration: "100分鐘", horror: 1, brain: 4,
    styles: ["中國古風", "盜賊體驗"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/thief10th"],
    story_summary: "《賊-十載春秋》以中國古風與盜賊任務為主軸，適合喜歡角色任務與機關解謎的團隊。", story_summary_source_excerpt: "A5 官方主題頁列出賊-十載春秋為中壢中原店主題，100 分鐘、4–8 人。"
  }),
  topic({
    id: "popular-138", name: "奎蕾精神病院", venue_name: "A5 Studio 實境密室逃脫｜中壢中原店", city: "桃園市", district: "中壢中原店", players: "3–6", duration: "90分鐘", horror: 4, brain: 3,
    styles: ["驚悚懸疑", "新手推薦"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/hospital"],
    story_summary: "《奎蕾精神病院》以驚悚懸疑與較友善的入門節奏，帶玩家探索中壢中原店的醫院場景。", story_summary_source_excerpt: "A5 官方主題頁列出奎蕾精神病院為中壢中原店主題，90 分鐘、3–6 人。"
  }),
  topic({
    id: "popular-139", name: "殭局", venue_name: "A5 Studio 實境密室逃脫｜中壢中原店", city: "桃園市", district: "中壢中原店", players: "4–6", duration: "120分鐘", horror: 5, brain: 3,
    styles: ["香港血案", "恐怖寫實"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/Hongkong"],
    story_summary: "《殭局》以香港血案與恐怖寫實風格，推進中壢中原店的高壓密室故事。", story_summary_source_excerpt: "A5 官方主題頁列出殭局為中壢中原店主題，120 分鐘、4–6 人。"
  }),
  topic({
    id: "popular-140", name: "理髮師陶德卡特", venue_name: "A5 Studio 實境密室逃脫｜中壢中原店", city: "桃園市", district: "中壢中原店", players: "5–8", duration: "120分鐘", horror: 2, brain: 4,
    styles: ["感人劇情", "英國工業風"], source_urls: ["https://www.a5-studio.com.tw/密室逃脫主題", "https://booking.a5studio.com.tw/activities/barber"],
    story_summary: "《理髮師陶德卡特》以英國工業風與感人劇情包裝中壢中原店的故事解謎。", story_summary_source_excerpt: "A5 官方主題頁列出理髮師陶德卡特為中壢中原店主題，120 分鐘、5–8 人。"
  }),
  topic({
    id: "popular-141", name: "失物招領", venue_name: "謎失工作室｜桃園山子頂店", city: "桃園市", district: "山子頂店", players: "2–4", duration: "依官網公告", horror: 3, brain: 3,
    styles: ["校園懸疑", "恐怖氛圍"], source_urls: ["https://www.missstudio.design/", "https://missstudio.simplybook.asia/v2/", "https://escape.bar/firm/10282"],
    story_summary: "《失物招領》以校園服務與禁忌空間為題材，適合喜歡微恐懸疑與小隊解謎的玩家。", story_summary_source_excerpt: "謎失官方網站列出失物招領為桃園山子頂店主題，2–4 人並標示恐怖／懸疑元素。"
  }),
  topic({
    id: "popular-142", name: "301號房", venue_name: "謎失工作室｜桃園山子頂店", city: "桃園市", district: "山子頂店", players: "2–4", duration: "依官網公告", horror: 3, brain: 3,
    styles: ["旅社懸疑", "異樣氛圍"], source_urls: ["https://www.missstudio.design/", "https://missstudio.simplybook.asia/v2/"],
    story_summary: "《301號房》以旅社清潔任務與異樣氛圍展開懸疑故事，適合小隊合作探索。", story_summary_source_excerpt: "謎失官方網站列出 301 號房為桃園山子頂店主題，2–4 人並標示旅社清潔／懸疑／異樣。"
  }),
  topic({
    id: "popular-143", name: "藝樣的代價", venue_name: "謎失工作室｜桃園中壢店", city: "桃園市", district: "中壢店", players: "2–6", duration: "依官網公告", horror: 2, brain: 4,
    styles: ["怪盜任務", "攀爬體驗"], source_urls: ["https://www.missstudio.design/", "https://missstudio.simplybook.asia/v2/"],
    story_summary: "《藝樣的代價》以怪盜竊取秘寶為任務主軸，加入體力與攀爬挑戰。", story_summary_source_excerpt: "謎失官方網站列出藝樣的代價為桃園中壢店主題，2–6 人並標示怪盜、竊取秘寶與攀爬。"
  }),
  topic({
    id: "popular-144", name: "朱砂", venue_name: "謎失工作室｜桃園中壢店", city: "桃園市", district: "中壢店", players: "2–6", duration: "依官網公告", horror: 2, brain: 4,
    styles: ["懸疑推理", "微驚悚"], source_urls: ["https://www.missstudio.design/", "https://missstudio.simplybook.asia/v2/"],
    story_summary: "《朱砂》以菜鳥警員調查懸案為故事入口，結合診所場景與微驚悚推理。", story_summary_source_excerpt: "謎失官方網站列出朱砂為桃園中壢店主題，2–6 人並標示懸疑與微驚悚。"
  }),
  topic({
    id: "popular-145", name: "伴", venue_name: "闇間工作室｜中壢店", city: "桃園市", district: "中壢店", players: "依官網公告", duration: "依官網公告", horror: 1, brain: 3,
    styles: ["溫馨浪漫", "求婚客製"], source_urls: ["https://darkfileescape.com/", "https://darkfileescape.boostime.me/activities/couple"],
    story_summary: "《伴》是闇間中壢店的溫馨浪漫主題，亦提供客製求婚體驗，完整人數與時間以預約頁為準。", story_summary_source_excerpt: "闇間官方網站列出伴為中壢店主題，標示溫馨浪漫、二人開團與客製求婚。"
  }),
  topic({
    id: "popular-146", name: "怨憶", venue_name: "闇間工作室｜中壢店", city: "桃園市", district: "中壢店", players: "依官網公告", duration: "依官網公告", horror: 5, brain: 4,
    styles: ["恐怖驚悚", "多人合作", "身歷其境"], source_urls: ["https://darkfileescape.com/", "https://darkfileescape.boostime.me/activities/resentmemory"],
    story_summary: "《怨憶》以恐怖驚悚、多人合作與身歷其境為主軸，完整人數與時間以預約頁為準。", story_summary_source_excerpt: "闇間官方網站列出怨憶為中壢店主題，標示恐怖驚悚、多人合作與身歷其境。"
  }),
  topic({
    id: "popular-147", name: "康樂保衛戰", venue_name: "闇間工作室｜中壢店", city: "桃園市", district: "中壢店", players: "依官網公告", duration: "依官網公告", horror: 1, brain: 3,
    styles: ["陣營遊戲", "機關操作", "多人派對"], source_urls: ["https://darkfileescape.com/", "https://darkfileescape.boostime.me/activities/colondefense"],
    story_summary: "《康樂保衛戰》以身分陣營與機關操作為主軸，提供較輕鬆的多人派對型密室體驗。", story_summary_source_excerpt: "闇間官方網站列出康樂保衛戰為中壢店主題，標示多人派對、身分陣營與機關操作。"
  }),
  topic({
    id: "popular-148", name: "寶寶睡", venue_name: "揪揪玩密室逃脫", city: "宜蘭市", district: "羅東鎮｜中華路", players: "2–6", duration: "90分鐘", horror: 3, brain: 3,
    styles: ["沉浸演繹", "恐怖懸疑", "團隊合作"], source_urls: ["https://joinplay.com.tw/", "https://joinplay.boostime.me/activities/cnrotssg", "https://escape.bar/game/25384"],
    story_summary: "《寶寶睡》以安眠曲、失蹤夥伴與門外哭聲開場，將宜蘭羅東揪揪玩的沉浸演繹與團隊解謎結合。", story_summary_source_excerpt: "揪揪玩官方網站與預約頁確認寶寶睡為宜蘭羅東主題，90 分鐘、2–6 人並提供求救機制。"
  }),
];

const existingKeys = new Set(topics.map((item) => `${item.venue_name}::${item.name}`));
const next = [...topics];
for (const item of additions) {
  const key = `${item.venue_name}::${item.name}`;
  if (!existingKeys.has(key)) {
    next.push(item);
    existingKeys.add(key);
  }
}

await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ before: topics.length, candidates: additions.length, after: next.length, added: next.length - topics.length }, null, 2));
