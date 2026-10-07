#!/usr/bin/env python3
"""从 stays.json 里删掉「脚本抓取」的住宿条目（真删除，不留注释）。

判定规则：nameZh 与 nameEn **同时为空** 的条目 —— 即脚本从 OSM / Overpass 抓来、
还没有人工给定中英文名的那批。只要有中文名或英文名中的任意一个就保留。

⚠️ 真删除：条目会从 towns[].hotels 里消失，文件里再也找不到。
还原靠 git：`git checkout -- src/data/stays.json`（或重跑 fetch_stays*.py 重抓）。
抓取脚本本身不受影响 —— fetch_stays.py / fetch_stays_tourapi.py / fetch_stays_kakao.py
/ fetch_stays_manual.py 都还在，随时能重新生成全量数据。

用法：
    python3 scripts/drop_scraped_stays.py --dry-run   # 只看会删多少
    python3 scripts/drop_scraped_stays.py             # 落盘
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAYS = ROOT / 'src' / 'data' / 'stays.json'
RULE = 'nameZh 与 nameEn 均为空（脚本抓取、无人工中英文名）'


def should_drop(h: dict) -> bool:
    zh = (h.get('nameZh') or '').strip()
    en = (h.get('nameEn') or '').strip()
    return not zh and not en


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    data = json.loads(STAYS.read_text(encoding='utf-8'))
    if data.get('_dropped'):
        print('已执行过删除，跳过（如需重来先 git checkout -- src/data/stays.json）')
        return 0

    total = 0
    for town in data.get('towns', []):
        hotels = town.get('hotels') or []
        kept = [h for h in hotels if not should_drop(h)]
        dropped = len(hotels) - len(kept)
        town['hotels'] = kept
        # count 与 hotels 一致（源头 fetch_stays.py 就是 len(hotels)）
        if 'count' in town:
            town['count'] = len(kept)
        total += dropped
        print(f"  {town.get('ko')}: 保留 {len(kept)} / 删除 {dropped}")

    rebuilt = {}
    for k, v in data.items():
        if k == 'towns':
            rebuilt['_dropped'] = {
                'at': datetime.now(timezone.utc).isoformat(),
                'rule': RULE,
                'total': total,
                'restore': 'git checkout -- src/data/stays.json',
            }
        rebuilt[k] = v

    if not args.dry_run:
        STAYS.write_text(json.dumps(rebuilt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'共删除 {total} 条' + ('（dry-run，未落盘）' if args.dry_run else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
