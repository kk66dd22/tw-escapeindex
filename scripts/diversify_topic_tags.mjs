import fs from "node:fs";

const dataPath = new URL("../data/topics.json", import.meta.url);
const topics = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const prosByStyle = [
  { match: ["真人互動"], values: ["真人互動壓迫感強", "NPC互動節奏鮮明", "臨場反應很有記憶點", "角色演出讓線索更立體", "互動橋段有明確目的", "現場反應感很突出", "演員介入節奏自然", "故事與互動銜接順暢", "沉浸感來自即時回應", "喜歡演出型密室會加分"] },
  { match: ["機關"], values: ["機關操作有存在感", "場景機關層次豐富", "動手解鎖回饋明確", "實體線索回饋清楚", "機關與劇情互相呼應", "操作感比純紙筆更強", "場景互動點分布自然", "解鎖瞬間很有成就感", "手作機關細節有誠意", "喜歡動手探索會加分"] },
  { match: ["沉浸劇情"], values: ["沉浸劇情完整", "角色線索帶入感強", "故事節奏有畫面", "世界觀入口交代清楚", "情緒轉折容易投入", "劇情線索不只作為裝飾", "角色任務感明確", "故事收束具有記憶點", "場景與敘事互相支撐", "適合重視故事的玩家"] },
  { match: ["場景探索"], values: ["場景探索線索密度高", "空間細節值得觀察", "環境敘事辨識度高", "探索路線有發現感", "環境物件不只是佈景", "場景轉換帶來驚喜", "觀察細節能換來回饋", "空間動線具有戲劇性", "氣氛營造從入口就開始", "適合喜歡慢慢搜查的隊伍"] },
  { match: ["日系解謎"], values: ["日系謎題氛圍到位", "細節觀察很有趣", "解謎節奏清爽", "提示設計具有日系感", "符號與物件線索呼應", "謎題呈現乾淨易讀", "細節控能找到樂趣", "解題回饋不拖沓", "氛圍與推理比例平衡", "適合喜歡觀察型謎題的玩家"] },
  { match: ["科幻"], values: ["科幻場景辨識度高", "任務感明確", "世界觀道具完整", "科技介面提升代入感", "探索目標分段清楚", "未來感視覺有記憶點", "任務節點容易追蹤", "裝置與劇情互相呼應", "適合喜歡異世界設定的隊伍", "科幻題材辨識度高"] },
  { match: ["奇幻"], values: ["奇幻世界觀鮮明", "視覺主題容易入戲", "冒險感自然展開", "道具細節富有想像力", "場景色彩有辨識度", "探索過程像翻開童話", "角色任務帶有冒險感", "適合喜歡非寫實題材的玩家", "幻想設定容易形成畫面", "主題氣質輕盈好入門"] },
  { match: ["任務"], values: ["任務目標清楚", "團隊分工感明確", "推進節點容易掌握", "隊伍討論方向明確", "線索共享時成就感高", "關卡推進有節奏", "合作比單人硬解更有趣", "每位隊員都有發揮空間", "適合喜歡任務流程的團隊", "目標感能維持投入度"] },
];
const fallbackPros = ["主題辨識度鮮明", "適合喜歡換口味的隊伍", "跨店家比較資訊完整", "場景氛圍有記憶點", "團隊討論感自然", "主題風格容易辨識", "適合安排成聚會行程", "資訊整理方便事前比較", "隊伍共識容易建立", "適合先從特色入手挑選"];

function pick(values, index, offset = 0) { return values[(index + offset) % values.length]; }
function maxPlayers(value) { return Number(value.split("–")[1] ?? value.split("-")[1] ?? 99); }
function firstStylePros(topic, index) {
  const style = prosByStyle.find((entry) => entry.match.some((needle) => topic.styles.some((item) => item.includes(needle))));
  return style ? pick(style.values, index) : pick(fallbackPros, index);
}
function secondPros(topic, index) {
  if (topic.horror >= 4) return pick(["驚悚氣氛集中", "高壓情境很有辨識度", "恐怖演出存在感高", "黑暗場景帶入感強", "情緒張力持續在線", "驚嚇與解謎互相推進", "高壓節奏很有記憶點", "氣氛音效加深沉浸感", "適合追求刺激的隊伍", "恐怖主題辨識度明確"], index, 1);
  if (topic.brain >= 4) return pick(["反轉燒腦感明顯", "線索串接適合討論", "推理層次有挑戰", "多線索並行很有張力", "解題需要建立共識", "推理細節值得回頭檢查", "謎題層次帶來成就感", "適合喜歡拆解線索的玩家", "解題過程有持續追蹤感", "高難度帶來討論空間"], index, 2);
  if (topic.styles.some((style) => style.includes("多人") || style.includes("團隊"))) return pick(["多人協作氣氛熱絡", "適合一起交換線索", "隊伍互動感自然", "分工後線索流動更快", "多人同步處理很有趣", "適合讓每位隊員參與", "團隊默契會直接影響節奏", "一起破關的成就感強", "討論聲量自然會升高", "適合朋友組隊挑戰"], index, 1);
  return pick(["新手也能找到切入點", "主題風格容易理解", "適合安排成聚會行程", "節奏輕盈不易冷場", "首次挑戰也能掌握方向", "適合想試試不同風格的隊伍", "氣氛與解謎比例舒服", "入門門檻相對友善", "適合把密室當聚會活動", "主題個性清楚好選擇"], index, 2);
}
function firstCons(topic, index) {
  if (topic.horror >= 4) return pick(["驚嚇強度高，先確認接受度", "高壓演出不適合怕黑者", "恐怖橋段密集，心理準備要足", "黑暗環境可能放大緊張感", "怕驚嚇者建議先看分級", "情緒壓力較高，需做好心理準備", "恐怖演出比例偏高", "不習慣追逐感者先評估", "氛圍緊繃時溝通更重要", "低耐受度玩家可先詢問店家"], index);
  if (topic.brain >= 4) return pick(["謎題邏輯較吃團隊溝通", "高難度線索需要耐心整理", "推理資訊量偏大", "線索關聯不易一次看懂", "需要保留時間回頭驗證", "資訊分散時容易漏看", "對首次挑戰者較有壓力", "適合先分配觀察與記錄角色", "解題節奏可能因討論變慢", "不喜歡長時間推理者先評估"], index, 1);
  if (maxPlayers(topic.players) >= 8) return pick(["多人協作時資訊量較大", "隊伍分工不足容易漏線索", "人數多時需先約定溝通方式", "多人同時行動可能互相干擾", "隊伍太大時需要指定記錄者", "資訊交換不順會拖慢節奏", "建議先決定誰負責觀察", "適合有基本團隊默契的隊伍", "人多時要留意每人參與度", "分工混亂容易錯過關鍵提示"], index, 2);
  if (maxPlayers(topic.players) <= 4) return pick(["小隊分工空間較有限", "人數少時需主動共享線索", "小隊配置要留意角色分工", "每個人都要主動觀察", "少人時無法同時處理多條線索", "需要更頻繁交換發現", "小隊默契會明顯影響節奏", "不適合期待單人安靜解題", "角色任務需要彼此支援", "人少時卡關壓力較集中"], index, 1);
  return pick(["熱門時段建議提早預約", "入場前請核對最新規則", "首次遊玩可先確認提示制度", "票價與場次請以官方公告為準", "活動檔期可能影響可選時間", "預約前要確認館別與集合位置", "不同分店規則可能不完全相同", "建議出發前再次查看通知", "熱門日期較需要提早安排", "可先確認是否有服裝或安全要求"], index, 2);
}
function secondCons(topic, index) {
  if (topic.duration === "待核對") return pick(["遊戲時間請以官方公告為準", "場次長度需預約前再次確認", "活動檔期可能影響可選時段", "公開資料未完整列出遊戲時間", "檔期異動時體驗內容可能調整", "請先確認當日場次與報到時間", "資料庫時間欄位仍待官方核對", "預約時可順便詢問提示方式", "主題資訊可能隨活動更新", "建議以入場前最新公告為準"], index, 1);
  if (topic.styles.some((style) => style.includes("真人互動"))) return pick(["互動強度高，怕尷尬者先評估", "需接受近距離演出安排", "對互動敏感者建議先詢問店家", "演出過程可能需要即時回應", "不習慣被引導者先確認形式", "互動橋段需保留臨場反應空間", "對角色扮演敏感者可先詢問", "團隊需配合現場指示推進", "演出節奏可能影響解題速度", "建議事前告知隊友接受程度"], index, 2);
  if (topic.brain >= 4) return pick(["謎題邏輯較跳躍時需耐心溝通", "卡關時要善用提示機制", "細節遺漏可能拖慢節奏", "資訊量大時容易忽略小線索", "部分關卡需要反覆確認假設", "不熟悉解謎分工可能較吃力", "遇到卡關要及早整理已知資訊", "推理路線可能需要多次修正", "細節觀察不足會影響後續進度", "高難度隊伍要預留討論時間"], index);
  return pick(["熱門檔期可能較難搶", "建議先確認交通與集合時間", "不同場次體驗細節可能有差異", "部分資訊需以預約頁最新內容為準", "尖峰時段較需要提前安排", "首次到訪建議提早抵達", "場館位置請事前確認路線", "不同日期可能有不同活動安排", "建議保留入場前的緩衝時間", "預約前可再次核對取消規則"], index, 1);
}

for (const [index, topic] of topics.entries()) {
  topic.pros = [firstStylePros(topic, index), secondPros(topic, index)];
  topic.cons = [firstCons(topic, index), secondCons(topic, index)];
  topic.tag_provenance = "editorial_tags_derived_from_existing_topic_metadata";
  topic.tag_provenance_note = "優缺點為編輯部依既有 styles、恐怖／燒腦導覽分級、人數與資料品質欄位整理；非逐字玩家評論或官方評分。";
}

fs.writeFileSync(dataPath, `${JSON.stringify(topics, null, 2)}\n`);
const all = topics.flatMap((topic) => [...topic.pros, ...topic.cons]);
const counts = Object.fromEntries([...new Set(all)].map((label) => [label, all.filter((item) => item === label).length]));
const duplicateRate = 1 - Object.keys(counts).length / all.length;
console.log(JSON.stringify({ topics: topics.length, uniqueTags: Object.keys(counts).length, totalTags: all.length, duplicateRate: Number(duplicateRate.toFixed(3)), maxDuplicate: Math.max(...Object.values(counts)) }, null, 2));
