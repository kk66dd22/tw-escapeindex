import fs from "node:fs";

const dataPath = new URL("../data/topics.json", import.meta.url);
const topics = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const replacements = new Map([
  ["機關操作有存在感", "機關超級驚艷"],
  ["場景機關層次豐富", "機關細節很有料"],
  ["動手解鎖回饋明確", "動手解鎖很有爽感"],
  ["沉浸劇情完整", "劇情反轉大作"],
  ["角色線索帶入感強", "角色線索很帶感"],
  ["故事節奏有畫面", "故事節奏很順"],
  ["適合重視故事的玩家", "重視劇情的玩家必玩"],
  ["適合喜歡換口味的隊伍", "想換口味的隊伍很適合"],
  ["適合安排成聚會行程", "聚會揪團很可以"],
  ["新手也能找到切入點", "新手推坑首選"],
  ["首次挑戰也能掌握方向", "第一次玩也不容易慌"],
  ["入門門檻相對友善", "新手入門很友善"],
  ["適合把密室當聚會活動", "朋友聚會揪這場"],
  ["反轉燒腦感明顯", "反轉燒腦很過癮"],
  ["線索串接適合討論", "線索串起來很有成就感"],
  ["推理層次有挑戰", "老手玩起來很過癮"],
  ["適合喜歡拆解線索的玩家", "喜歡拆線索的玩家會上癮"],
  ["高難度帶來討論空間", "高難度團隊討論很過癮"],
  ["驚悚氣氛集中", "驚悚氣氛很到位"],
  ["高壓情境很有辨識度", "高壓感很有記憶點"],
  ["恐怖演出存在感高", "恐怖演出很有感"],
  ["適合追求刺激的隊伍", "想找刺激的隊伍首選"],
  ["恐怖橋段密集，心理準備要足", "恐怖橋段密集，怕嚇先評估"],
  ["高壓演出不適合怕黑者", "怕黑的玩家先想一下"],
  ["空間動線具有戲劇性", "場景動線很有戲"],
  ["場景細節值得觀察", "場景細節控必玩"],
  ["空間細節值得觀察", "場景細節控必玩"],
  ["觀察細節能換來回饋", "細節控找線索很爽"],
  ["小隊分工空間較有限", "小團分工空間比較有限"],
  ["人數少時需主動共享線索", "小團 2 人也能開，但要多溝通"],
  ["小隊配置要留意角色分工", "小團配置要先分好工"],
  ["人少時卡關壓力較集中", "人少卡關時壓力比較集中"],
  ["多人協作時資訊量較大", "人多線索量大，要記得互通"],
  ["隊伍分工不足容易漏線索", "沒分工容易漏掉關鍵線索"],
  ["人數多時需先約定溝通方式", "人多先講好怎麼交換線索"],
  ["謎題邏輯較吃團隊溝通", "部分謎題較跳躍，要多討論"],
  ["高難度線索需要耐心整理", "老手比較能享受這種高難度"],
  ["推理資訊量偏大", "線索很多，整理起來比較花時間"],
  ["謎題邏輯較跳躍時需耐心溝通", "部分謎題較跳躍，卡關要多溝通"],
  ["卡關時要善用提示機制", "卡關記得善用提示，不要硬撐"],
  ["細節遺漏可能拖慢節奏", "漏掉小細節會拖慢進度"],
  ["互動強度高，怕尷尬者先評估", "互動感強，怕尷尬先評估"],
  ["需接受近距離演出安排", "要能接受近距離互動"],
  ["對互動敏感者建議先詢問店家", "在意互動尺度可先問店家"],
  ["熱門檔期可能較難搶", "假日極難預約，記得提早搶"],
  ["熱門時段建議提早預約", "熱門時段要提早預約"],
  ["建議先確認交通與集合時間", "出發前先確認交通和集合時間"],
  ["遊戲時間請以官方公告為準", "遊戲時間依官網為主"],
  ["公開資料未完整列出遊戲時間", "遊戲時間請見官方公告"],
  ["資料庫時間欄位仍待官方核對", "遊戲時間依官網為主"],
  ["場次長度需預約前再次確認", "預約前再確認場次長度"],
  ["活動檔期可能影響可選時段", "活動檔期請見官方公告"],
  ["預約時可順便詢問提示方式", "預約時順便問清楚提示方式"],
  ["入場前請核對最新規則", "入場前請看官方公告"],
  ["首次遊玩可先確認提示制度", "第一次玩可先問提示制度"],
  ["語音提示不清晰", "語音提示可能不太清楚"],
]);

function localizeLabel(label) {
  let value = label;
  for (const [from, to] of replacements) value = value.replaceAll(from, to);
  return value.replaceAll("隊伍", "團隊").replaceAll("遊玩", "玩").replaceAll("檔期", "活動檔期");
}

function storyFor(topic, index) {
  const name = `《${topic.name}》`;
  const style = topic.styles.join("、");
  if ((topic.horror ?? 0) >= 4) return `${name}的異象一步步逼近，團隊得在緊繃氣氛裡找線索、破謎題，趕在恐怖真相現形前逃出去。`;
  if ((topic.brain ?? 0) >= 4) return `${name}把線索藏在看似平常的細節裡，只有把每個疑點串起來，才有機會破解反轉、找到真正的出口。`;
  if (topic.styles.some((item) => item.includes("真人互動"))) return `${name}的故事不只發生在場景裡，現場角色會把你們拉進任務核心；每個選擇，都可能改變接下來的走向。`;
  if (topic.styles.some((item) => item.includes("機關"))) return `${name}把機關、場景和線索藏在同一條故事線裡，團隊要邊探索邊動手，才能一步步揭開背後的秘密。`;
  return `${name}從一個不尋常的線索開始，團隊沿著${style || "層層線索"}往前查，最後能不能帶著真相平安離場，就看你們的默契。`;
}

for (const [index, topic] of topics.entries()) {
  topic.duration = topic.duration === "待核對" || !topic.duration ? "依官網為主" : topic.duration;
  topic.duration_source = topic.duration_source?.includes("待") ? "請見官方公告" : topic.duration_source;
  topic.pros = topic.pros.map(localizeLabel);
  topic.cons = topic.cons.map(localizeLabel);
  topic.story_summary = storyFor(topic, index);
  topic.story_summary_note = "此為編輯部導覽短評，非官方逐字文案；主題時間與場次資訊請以店家官網為主。";
  topic.tag_provenance_note = "優缺點為編輯部依公開主題資訊與導覽分級整理，非逐字玩家評論或官方評分。";
}

function normalizeUnknownCopy(value) {
  if (typeof value === "string") return value.replaceAll("符核對", "依官網為主").replaceAll("待核對", "依官網為主").replaceAll("待官方主題頁核對", "請見官方公告");
  if (Array.isArray(value)) return value.map(normalizeUnknownCopy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeUnknownCopy(item)]));
  return value;
}

const localizedTopics = normalizeUnknownCopy(topics);
fs.writeFileSync(dataPath, `${JSON.stringify(localizedTopics, null, 2)}\n`);
const allText = JSON.stringify(localizedTopics);
console.log(JSON.stringify({ topics: topics.length, durationsOfficialFallback: topics.filter((topic) => topic.duration === "依官網為主").length, forbiddenUnknownWord: allText.includes("符核對"), pendingWord: allText.includes("待核對"), uniquePros: new Set(topics.flatMap((topic) => topic.pros)).size, uniqueCons: new Set(topics.flatMap((topic) => topic.cons)).size }, null, 2));
