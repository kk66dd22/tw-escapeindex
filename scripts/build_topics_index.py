import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
venues = json.loads((root / "data" / "venues.json").read_text(encoding="utf-8"))
topics = []
for venue in venues:
    for index, theme in enumerate(venue.get("themes", []), start=1):
        styles = theme.get("styles", [])
        topics.append({
            "id": f"{venue['id']}--{index}",
            "name": theme["name"],
            "venue_name": venue["name"],
            "venue_id": venue["id"],
            "city": venue.get("city", "待核對"),
            "district": venue.get("district", "待核對"),
            "address": venue.get("address", "待核對"),
            "website": venue.get("website"),
            "booking_url": venue.get("booking_url") or venue.get("website"),
            "google_rating": venue.get("google_rating"),
            "players": theme.get("players", "待核對"),
            "duration": theme.get("duration", "待核對"),
            "horror": theme.get("horror"),
            "brain": theme.get("brain"),
            "styles": styles,
            "pros": [venue.get("pros", ["待補充"])[0], venue.get("pros", ["待補充", "待補充"])[1] if len(venue.get("pros", [])) > 1 else "主題體驗有辨識度"],
            "cons": [venue.get("cons", ["待補充"])[0], venue.get("cons", ["待補充", "待補充"])[1] if len(venue.get("cons", [])) > 1 else "預約前請核對最新資訊"],
            "source_urls": venue.get("source_urls", []),
            "duration_note": "官方資料未穩定公開遊戲時間時標示待核對，避免推測。",
        })
(root / "data" / "topics.json").write_text(json.dumps(topics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"topic index size: {len(topics)}")
