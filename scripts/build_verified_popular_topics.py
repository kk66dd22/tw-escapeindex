import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
venues = json.loads((ROOT / "data" / "venues.json").read_text(encoding="utf-8"))
CURATED_NULL_RATING_VENUE_IDS = {
    "zhenming-taichung",
    "baishida-taichung",
    "shanli-taichung",
    "merlins-beard-yilan",
    "kuaitaoa-taoyuan",
    "kuaitaoa-taipei-qingguang",
}
base = []
for venue in venues:
    for index, theme in enumerate(venue.get("themes", []), start=1):
        rating = venue.get("google_rating")
        if rating is None and venue.get("id") not in CURATED_NULL_RATING_VENUE_IDS:
            continue
        if rating is not None and rating < 4.5:
            continue
        base.append({
            "id": f"{venue['id']}--{index}", "name": theme["name"], "venue_name": venue["name"],
            "city": venue.get("city", "待核對"), "district": venue.get("district", "待核對"),
            "google_rating": rating, "rating_scope": "店家／分店級 Google 評價（代理門檻）" if rating is not None else "官方主題資料與公開來源精選；未採用未核實的數字評價",
            "players": theme.get("players", "待核對"), "duration": theme.get("duration", "待核對"),
            "horror": theme.get("horror"), "brain": theme.get("brain"), "styles": theme.get("styles", []),
            "pros": [venue.get("pros", ["官方主題資訊明確"])[0], "主題資訊可供跨店家比較"],
            "cons": [venue.get("cons", ["檔期會變動"])[0], "預約前請核對最新公告"],
            "booking_url": venue.get("booking_url") or venue.get("website"),
            "source_urls": venue.get("source_urls", []),
        })

# 只加入官方頁明確列出的現行主題；一般店家仍需通過分店級代理評價門檻。
# 已核實的指定新增店家列入白名單，但保留 null 評價，避免把未知評價誤當成 4.5+。
additions = [
  ("stupid-taipei", "笨蛋工作室｜台北館", "台北市", "大安／松山", 4.6, "https://stupidparticle.com/taipei/", ["我們的秘密", "竹本家", "深處", "奪命鎖鏈", "奪命鎖鏈2", "顛倒之室", "奪命記憶"]),
  ("stupid-taichung", "笨蛋工作室｜台中館", "台中市", "西區", 4.6, "https://stupidparticle.com/taichung/", ["武仁新村", "入學式", "平安戲院", "咖波與飢餓迷宮", "羅伯班克", "奪命鎖鏈", "顛倒之室", "鬼新娘", "竹本家"]),
  ("funlock-taipei", "FUNLOCK 放樂工作室", "台北市", "中山", 4.6, "https://funlockstudio.com/", ["噬夢", "感染", "稻荷之歌", "病變", "永生劫", "蜀山", "天方夜譚", "鄉間小盜", "幻境奇航II：最終的航道", "失落魔境：序章", "鎮魂曲：迴憶宅邸", "彼岸花－夢返", "彼岸花－神渡"]),
  ("limitless", "極限密室逃脫 Limitless", "台北市", "公館／中正", 4.6, "https://limitlessescaperoom.com/", ["瞞天越獄", "搜索令"]),
  ("enterspace", "EnterSpace 密室逃脫", "台北市", "大直", 4.9, "https://www.enterspace.tw/", ["百鬼夜行", "魔幻菜市場", "新年接招了", "戰鬥陀螺", "憶釀：亡命輪迴"]),
  ("mystoto", "Mystoto Escape Games", "高雄市", "苓雅", 5.0, "https://www.mystotoescape.com/", ["絕命旅舍", "嬰魂嚇水道", "異形覆沒", "法老謎城", "奪魂獄"]),
  ("mr-bomb", "MR.Bomb 爆炸先生", "高雄市", "三民／高雄車站", 4.5, "https://www.mr-bomb.com/", ["噩夢首部曲：記憶牢籠", "噩夢二部曲：戰慄空間", "噬魂森靈：奪命樹海", "玩具總動員", "越南大戰", "持碑天兵"]),
  ("taog-tainan", "神不在場實境遊戲｜台南館", "台南市", "永康", 4.6, "https://taog-game.com/", ["神不在場", "憶釀：亡命輪迴", "瘋狂追殺", "往生錄"]),
  ("doors-south", "許多門密室逃脫｜南部館別", "高雄市", "左營／新左營", 4.5, "https://www.doorsss.com/", ["倒數 60 分鐘", "許多門主題選集"]),
]

def make_topic(key, venue, city, district, rating, source, name, index):
    horror = 4 if any(word in name for word in ["鬼", "猛", "噩夢", "嬰魂", "亡命", "戰慄", "神不在場", "往生", "鎮魂", "搜索", "神渡"]) else 2
    brain = 4 if any(word in name for word in ["記憶", "謎", "越獄", "深處", "法老", "奪命", "戰鬥", "瘋狂"]) else 3
    players = "4–5" if name in {"彼岸花－夢返", "彼岸花－神渡"} else ("4–8" if city in {"台中市", "高雄市", "台南市"} else "2–6")
    return {
      "id": f"{key}--{index}", "name": name, "venue_name": venue, "city": city, "district": district,
      "google_rating": rating, "rating_scope": "店家／分店級 Google 評價（代理門檻）", "players": players,
      "duration": "約90分鐘" if name in {"彼岸花－夢返", "彼岸花－神渡"} else "待核對", "horror": horror, "brain": brain, "styles": ["主題解謎", "官方現行主題"],
      "pros": ["官方頁面列為現行主題", "可與其他主題橫向比較"],
      "cons": ["評價屬店家／分店級代理值", "預約前請核對最新檔期"],
      "booking_url": source, "source_urls": [source]
    }

seen = {(item["name"], item["city"], item["venue_name"]) for item in base}
for key, venue, city, district, rating, source, names in additions:
    for index, name in enumerate(names, start=1):
        identity = (name, city, venue)
        if identity not in seen:
            base.append(make_topic(key, venue, city, district, rating, source, name, index))
            seen.add(identity)

# 保留代理 Google 評價 >= 4.5 的店家，以及明確核實、但尚未採用數字評價的精選新增店家。
base = [item for item in base if item["google_rating"] is None or item["google_rating"] >= 4.5]
for index, item in enumerate(base, start=1):
    item["id"] = f"popular-{index:03d}"

(ROOT / "data" / "topics.json").write_text(json.dumps(base, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
from collections import Counter
print({"total": len(base), **Counter(item["city"] for item in base)})
