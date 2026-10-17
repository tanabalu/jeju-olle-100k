#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性脚本：补上 6 号线的李仲燮街（官方航点 JSON 里有这条，但 waypointsData.ts
生成时漏掉了，只能按官方沿线里程落点）。

坐标 126.55921, 33.24758 来自 06 号线轨迹的最后一个点 —— 官方航点把李仲燮街标在
10.7km，而轨迹总长只有 9.40km，两者都指向市区这一段的同一处位置（终点附近）。
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "data" / "curated_sights.json"

ITEM = {
    "name": "李仲燮街 Lee Jung-seop Street",
    "lng": 126.55921,
    "lat": 33.24758,
    "type": "village",
    "coord_src": "curated",
    "desc": "为纪念被流放西归浦期间在此作画、40 岁早逝的画家李仲燮而建的短街。"
            "街上有他的故居与美术馆，沿街是画廊、手工艺店、壁画和咖啡馆。"
            "美术馆自 2026 年 5 月起整修、部分展品撤展，重开预计在 2027 年 8 月，"
            "当前更适合当作街区本身来逛。",
}


def main() -> int:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    bucket = data["sights"].setdefault("06", [])
    if any(s["name"] == ITEM["name"] for s in bucket):
        print("  skip（已存在）")
    else:
        bucket.append(ITEM)
        print(f"  + 06 {ITEM['name']}")
    if "images" not in ITEM:
        ITEM["images"] = []

    SRC.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    total = sum(len(v) for v in data["sights"].values())
    print(f"Wrote {SRC} | total sights: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
