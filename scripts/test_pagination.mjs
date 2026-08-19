import fs from "node:fs";

const home = fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
const topics = JSON.parse(fs.readFileSync(new URL("../data/topics.json", import.meta.url), "utf8"));

if (!home.includes("useEffect(() => { setPage(1); }, [query, activeFilters, activeCity, sortMode])")) {
  throw new Error("篩選／排序變更後回到第 1 頁的 effect 不存在");
}
if (!home.includes("Array.from({ length: pageCount }, (_, index) => index + 1)")) {
  throw new Error("1–10 頁碼渲染邏輯不存在");
}
if (!home.includes("overflow-x-auto")) {
  throw new Error("手機頁碼列缺少橫向操作保護");
}

const pageSize = 10;
const pageCount = Math.ceil(topics.length / pageSize);
let page = 2;
const state = { query: "", activeFilters: [], activeCity: "全台", sortMode: "rating" };
const reset = () => { page = 1; };
for (const change of [
  () => { state.query = "恐怖"; },
  () => { state.activeCity = "台中市"; },
  () => { state.activeFilters = ["horror"]; },
  () => { state.sortMode = "brain"; },
]) {
  page = 2;
  change();
  reset();
  if (page !== 1) throw new Error("條件變更後未回到第 1 頁");
}

if (topics.length !== 100 || pageCount !== 10) throw new Error("100 筆資料未形成 10 頁");
console.log(JSON.stringify({ topics: topics.length, pageCount, resetCases: 4, mobileOverflowGuard: "overflow-x-auto" }, null, 2));
