"""台北密室案件庫：官方頁面採集與資料清洗範例。

用途：重新抓取公開官方頁面，保存快照摘要並更新 data/venues.json 的 checked_at。
注意：Google 評論星等屬動態第三方資料，不以 HTML 猜測；請使用 Google Places API 或人工核對後寫入。
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, asdict
from datetime import date
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "venues.json"
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
HEADERS = {"User-Agent": "EscapeIndexResearchBot/0.1 (contact: replace-with-your-email)"}

@dataclass
class PageSnapshot:
    url: str
    title: str
    text: str
    fetched_at: str


def fetch_snapshot(url: str) -> PageSnapshot:
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    for node in soup(["script", "style", "noscript"]):
        node.decompose()
    text = re.sub(r"\s+", " ", soup.get_text(" ")).strip()
    return PageSnapshot(url, soup.title.get_text(strip=True) if soup.title else "", text[:20000], date.today().isoformat())


def clean_venues() -> list[dict]:
    venues = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    for venue in venues:
        venue["last_source_fetch"] = date.today().isoformat()
        venue["name"] = re.sub(r"\s+", " ", venue["name"]).strip()
        venue["themes"] = [theme for theme in venue["themes"] if theme.get("name") and theme.get("players")]
        for theme in venue["themes"]:
            theme["horror"] = max(1, min(5, int(theme["horror"])))
            theme["brain"] = max(1, min(5, int(theme["brain"])))
    return venues


def main() -> None:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    venues = clean_venues()
    for venue in venues:
        try:
            snapshot = fetch_snapshot(venue["website"])
            out = SNAPSHOT_DIR / f"{venue['id']}.json"
            out.write_text(json.dumps(asdict(snapshot), ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[ok] {venue['name']}: {len(snapshot.text)} chars")
        except requests.RequestException as exc:
            print(f"[warn] {venue['name']}: {exc}")
        time.sleep(1)
    DATA_PATH.write_text(json.dumps(venues, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(venues)} venue records to {DATA_PATH}")

if __name__ == "__main__":
    main()
