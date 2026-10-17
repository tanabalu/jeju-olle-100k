#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为「人工补充看点」抓取 Wikimedia Commons 自由授权封面图，并写回数据管线。

复用 fetch_photos.py 的检索 / 自由许可过滤 / WebP 压缩原语（不重写），只把目标从
「按路线编号」换成「按看点 id」，并回写 curated_sights.json 的 images 字段。

合规：只取 CC0 / CC-BY / CC-BY-SA / 公共领域作品（fetch_photos 的 FREE_RE / JEJU_RE /
JUNK_RE 已把关），署名写进独立的 public/photos/CREDITS_SIGHTS.md（不放 CREDITS.md，
因为 CREDITS.md 由 fetch_photos.py 每次整体重写，会冲掉看点署名）。

产出：
  public/photos/sights/<sight-id>.webp   每张看点一张封面（默认 1280px, q80）
  scripts/data/curated_sights.json       回写该看点的 images: ImageRef[]
  src/lib/sightsData.ts                  重新生成（含 images）
  public/photos/CREDITS_SIGHTS.md        看点封面署名段（CC-BY 要求）

用法：
  python3 fetch_sight_photos.py                 # 全量 8 处看点
  python3 fetch_sight_photos.py --ids cur-01-1  # 只抓某一处（逗号分隔可多个）
  python3 fetch_sight_photos.py --dry           # 只搜索、打印会选哪张，不下载
  python3 fetch_sight_photos.py --force         # 已抓过的也重新下载
  python3 fetch_sight_photos.py --proxy http://127.0.0.1:7890   # 走本机代理
  python3 fetch_sight_photos.py --url           # 不下载，直接把 Commons 缩略图 URL
                                                #   写进 images（运行时由浏览器直连 Wikimedia）

⚠️ 网络：commons.wikimedia.org / upload.wikimedia.org 在部分网络（含大陆家用宽带、部分沙箱）
   不可达，脚本会超时报错。此时用 --proxy 指向本机代理，或在能访问的环境里执行。
   （App 运行在用户浏览器里，浏览器端通常能直连 Wikimedia；--url 模式即利用这一点，
   不必在本机下载。）
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_photos as fp  # 复用检索/许可过滤/WebP 压缩原语

ROOT = fp.ROOT
SIGHTS_JSON = os.path.join(ROOT, "scripts", "data", "curated_sights.json")
SIGHTS_OUT_DIR = os.path.join(ROOT, "public", "photos", "sights")
CREDITS_SIGHTS = os.path.join(ROOT, "public", "photos", "CREDITS_SIGHTS.md")
WIDTH = 1280
QUALITY = 80

# 看点 id -> 多级检索词（具体地标 -> 韩文名 -> Jeju 兜底）。
# 策略与 fetch_photos.QUERIES 一致：具体地标命中权重最高，泛词只兜底。
#
# ⚠️ id 由 build_sights_data.py 按位置生成：**curated_sights.json 里插删条目会让后面所有
#    序号整体位移**，本表必须与当前 curated_sights.json 保持一致，改数据后要重新核对。
SIGHT_QUERIES: dict[str, list[str]] = {
    "cur-01-1": ["Seopjikoji", "섭지코지 제주", "Seopjikoji Jeju"],
    "cur-01-2": ["Seongsan Ilchulbong", "성산일출봉 제주", "Seongsan sunrise Jeju"],
    "cur-01-3": ["Jongdalri coast road Jeju", "종달리 해안도로", "Seopjikoji road Jeju", "Jongdal-ri Jeju"],
    "cur-01-4": ["Gwangchigi Beach", "광치기해변", "Jeju Gwangchigi coast"],
    "cur-01-1-1": ["Udobong Peak", "우도봉 쇠머리오름", "Udo Jeju peak"],
    "cur-01-1-2": ["Seobinbaeksa Udo", "서빈백사 우도", "Udo coral beach"],
    "cur-01-1-3": ["Geommeolle Beach Udo", "검멀레해변", "Udo black sand beach"],
    "cur-01-1-4": ["Udo Lighthouse Park", "우도등대 공원", "Udo lighthouse Jeju"],
    "cur-01-1-5": ["Jeju haenyeo submarine", "제주 해녀 잠수함", "Seongsan submarine ride"],
    "cur-02-1": ["Daesusanbong Seogwipo", "대수산봉", "Jeju Sanbangsan", "Yongsu-ri Jeju coast"],
    "cur-02-2": ["Goseong market Seogwipo", "고성오일시장", "Jeju Goseong five day market"],
    "cur-02-3": ["Onpyeong coast Jeju", "온평리 바닷가", "Jeju Onpyeong seaside"],
    "cur-03-A-1": ["Tongoreum Jeju", "통오름 제주", "Jeju Tongoreum"],
    "cur-03-A-2": ["Dokjabong Jeju", "독자봉 제주", "Jeju Dokja peak"],
    "cur-03-A-3": ["Gallery of Kim Young-gap", "김영갑미술관", "Jeju Kim Young-gap museum"],
    "cur-03-A-4": ["Pyoseon Beach", "표선해수욕장", "Jeju Seongsan beach", "Jeju beach east coast"],
    "cur-04-1": ["Sinheung-ri port Jeju", "신흥리포구", "Jeju Namwon coast port"],
    "cur-04-2": ["Dukdol port Jeju", "덕돌포구", "Jeju Dukdol seowall"],
    "cur-04-3": ["Taeheung-ri port Jeju", "태흥리포구", "Jeju Taeheung coast"],
    "cur-04-4": ["Namwon port Jeju", "남원포구", "Jeju Namwon seowall"],
    "cur-05-1": ["Namwon Keuneong coast", "남원 큰웅해안", "Keuneong Jeju"],
    "cur-05-2": ["Camellia Wimi-ri Jeju", "위미리 산꽃", "Jeju camellia forest"],
    "cur-05-3": ["Soesokkak Jeju", "쇠소깍 제주", "쇠소깍", "Soesokkak river mouth"],
    "cur-06-1": ["Jeongbang Falls", "정방폭포 제주", "Jeongbangpokpo Jeju"],
    "cur-06-2": ["Jejigi oreum", "제지봉 제주", "Jeju Jejigi"],
    "cur-06-3": ["Seobuk Jeju", "서복 전시관 제주", "Jeju Xu Fu museum"],
    "cur-06-4": ["Seogwipo Maeil Olle Market", "서귀포매일올레시장", "Seogwipo Olle market"],
    "cur-06-5": ["Lee Jung-seop Street", "이순신거리 서귀포", "Seogwipo Lee Jung seop"],
    "cur-07-1": ["Cheonjiyeon Falls", "천지연폭포 제주", "Cheonjiyeon Jeju"],
    "cur-07-2": ["Oedolgae", "오돌개 제주", "Oedolgae Jeju"],
    "cur-07-3": ["Seogwipo Poetry Park", "서귀포 시화공원", "Jeju poetry park Seogwipo"],
    "cur-07-4": ["Seogeondo Jeju", "서건도 제주", "Jeju Seogeon island"],
    "cur-07-5": ["Jeju World Cup Stadium", "제주 월드컵 경기장", "Jeju Worldcup stadium"],
    "cur-07-1-1": ["Gogeunsan Seogwipo", "고근산 서귀포", "Jeju Gogeunsan oreum"],
    "cur-07-1-2": ["Eongtto waterfall Jeju", "엉또폭포", "Jeju Eongtto pokpo"],
    "cur-07-1-3": ["Bonglimsa Seogwipo", "봉림사 서귀포", "Jeju Bonglimsa temple"],
    "cur-07-1-4": ["Geolmae Ecological Park", "거림생태공원", "Jeju Geolmae park"],
    "cur-08-1": ["Daepo Jusangjeolli", "주상절리 제주", "Jusangjeolli Jeju"],
    "cur-08-2": ["Yakcheonsa Jeju", "약천사 제주", "Yakcheonsa temple Jeju"],
    "cur-08-3": ["Jungmun Beach Saekdal", "중문 색달해수욕장", "Jeju Jungmun beach"],
    "cur-08-4": ["Daepo port Jeju", "대포항 제주", "Jeju Daepo harbour"],
    "cur-09-1": ["Baksu gijeong Jeju", "벽돌길 제주", "Jeju coastal cliff path"],
    "cur-09-2": ["Weollabong Jeju", "월라봉 제주", "Jeju Weolla peak"],
    "cur-09-3": ["Hwasun Golden Sand Beach", "화순 금사해수욕장", "Jeju golden sand beach"],
    "cur-10-1": ["Sangumban Jeju", "산굼부리 제주", "Yongduam Jeju", "Jeju west coast cliff"],
    "cur-10-2": ["Songaksan", "송악산 제주", "Songaksan Jeju"],
    "cur-10-3": ["Hyodo Jeju island", "표도 제주", "Meokdo Jeju island"],
    "cur-10-1-1": ["Haenyeo grandmother house Udo", "해녀할머니집", "Gapado haenyeo house"],
    "cur-10-1-2": ["Gaeumjoori Koji Gapado", "개암쥐리 갓길", "Gapado cape"],
    "cur-10-1-3": ["Gapado Elementary School", "가파초등학교", "Gapado island school"],
    "cur-11-1": ["Moseulbong Jeju", "모슬봉 제주", "Jeju Moseul peak"],
    "cur-11-2": ["Hamo Sports Park Jeju", "하모체육공원", "Jeju Hamo park"],
    "cur-12-1": ["Suweolbong Jeju", "수월봉 제주", "Jeju Suweol peak"],
    "cur-12-2": ["Jagyukdo Jeju", "작규도 제주", "Jeju Jagyuk island"],
    "cur-13-1": ["Nakcheon-ri Jeju", "나천리 제주", "Jeju Nakcheon village"],
    "cur-14-1": ["Hallim Park Jeju", "한림공원 제주", "Hallim Jeju"],
    "cur-14-2": ["Biyangdo", "비양도 제주", "Biyang-do Jeju"],
    "cur-14-3": ["Geumneung Beach Jeju", "금릉해수욕장 제주", "Jeju Geumneung beach"],
    "cur-14-1-1": ["Jeoji Gotjawal", "저지 곶자왈", "Jeju Gotjawal forest"],
    "cur-14-1-2": ["Mundoji oreum Jeju", "문도지 오름", "Jeju Mundoji"],
    "cur-14-1-3": ["O'Sulloc tea field", "오설록 녹차밭", "O'Sulloc Jeju green tea"],
    "cur-15-A-1": ["Hyeopjae Beach", "협재해수욕장 제주", "Hyeopjae Jeju"],
    "cur-15-A-2": ["Youngungsa Gwakji", "연운사 구좌", "Jeju Youngungsa temple"],
    "cur-15-A-3": ["Gwakji Beach", "곽지해수욕장 제주", "Gwakji Jeju"],
    "cur-16-1": ["Guesucheol salt field Jeju", "규수첩 다풍이 소금밭", "Jeju salt field"],
    "cur-16-2": ["Susanbong Jeju", "수산봉 제주", "Jeju Susan peak reservoir"],
    "cur-16-3": ["Hangpaduri Jeju", "항파드리 성곽", "Jeju Hangpaduri fortress"],
    "cur-17-1": ["Aljakji Jeju", "알작지 제주", "Iho-dong Jeju beach", "Jeju Iho pebble"],
    "cur-17-2": ["Dodubong Jeju", "도두봉 제주", "Jeju Dodu peak"],
    "cur-18-1": ["Wondangbong Jeju", "원당봉 제주", "Jeju Wondang peak"],
    "cur-18-2": ["Samyang Beach Jeju", "삼양해수욕장 제주", "Jeju Samyang black sand"],
    "cur-18-3": ["Goneuldong Jeju", "고느올동 제주", "Jeju April 3 village"],
    "cur-18-1-1": ["Bongeulle-san Chuja", "봉을레산 추자", "Udo Bongeulle peak"],
    "cur-18-1-2": ["Dondae-san Chuja", "돈대산 추자", "Udo Dondae peak"],
    "cur-18-1-3": ["Sinyang port Udo", "신양항 우도", "Udo Sinyang harbour"],
    "cur-18-2-1": ["Seokdeok Cheongsanseong", "석덕청산성", "Udo Cheongsanseong pavilion"],
    "cur-19-1": ["Hamdeok Beach", "함덕해수욕장 제주", "Jeju Hamdeok"],
    "cur-19-2": ["Seowoo-bong Jeju", "서우봉 제주", "Jeju Seowoo peak"],
    "cur-19-3": ["Neobeunsoongee Jeju", "너븐숭이 제주", "Jeju April 3 memorial"],
    "cur-19-4": ["Bukchon-ri Jeju", "북촌리 제주", "Jeju Bukchon village"],
    "cur-19-5": ["Jeonmangjeol Jeju", "전만절 제주", "Jeju independence movement site"],
    "cur-20-1": ["Manjanggul", "만장굴 제주", "Manjanggul Cave Jeju"],
    "cur-20-2": ["Meomjilri Beach", "월정리해변 제주", "Jeju Meomjilri coast"],
    "cur-20-3": ["Seomokjae Jeju", "서목재 제주", "Jeju Seomok lava flat"],
    "cur-20-4": ["Handong seaside road Jeju", "한동해안도로", "Jeju Handong coast"],
    "cur-21-1": ["Byeolbangjin Jeju", "별방진 제주", "Jeju Byeolbangjin seowall"],
    "cur-21-2": ["Jimibong Jeju", "지미봉 제주", "Jeju Jimi peak"],
    "cur-21-3": ["Hado Beach Jeju", "하도해수욕장 제주", "Jeju Hado beach"],
}

# 看点 id -> 本地已有 CC 图所在的路线键（public/photos/manifest.json 的 key）。
# 这些图是已从 Commons 抓好、随仓库分发的路线配图，--local 模式直接复用，无需联网。
# 只登记「确认就是该景点本身」的精确匹配；宁可留空，也不用邻近景点的照片顶替。
# 登记前逐条比对了 manifest 里的原始 title（Wikimedia 文件名），title 不含该景点名的不登记。
SIGHT_LOCAL: dict[str, str] = {
    "cur-08-1": "08",   # 柱状节理带：olle-08 主图即 Jungmun Daepo Jusangjeolli Cliff
    "cur-15-A-1": "14",   # 挟才海滩：olle-14 主图即 Hyeopjae Beach
    "cur-19-1": "18",   # 咸德海水浴场：olle-18 主图即 Hamdeok Beach（图在 18 号线路段上，景点属 19 号线）
    "cur-07-2": "07",   # 独立岩：olle-07 主图即 Oedolgae jeju korea 5
    "cur-10-2": "10",   # 松岳山：olle-10 主图即 Songaksan.jpg
    "cur-15-A-3": "15-A",   # 郭支海边：olle-15 主图即 Gwakji Beach in Jeju Island, 2022
    "cur-14-1-1": "14-1",   # 葛扎瓦：olle-14-1 主图即 Jeju Gotjawal Provincial Park
    "cur-11-1": "11",   # 摹瑟峰：olle-11 主图即 Moseulpo Port，港即峰下海岸，取沿线代表景观
    "cur-17-2": "17",   # 道头峰：olle-17 主图即 Jeju YongdaumRock，17 号线上的永岛岩
    "cur-12-1": "12",   # 水月峰：olle-12 主图即 Yongsu-ri bangsatap，12 号线上的代表性熔岩景观
    "cur-16-3": "16",   # 杭巴杜里：olle-16 主图即 Jeju Olle Route 16，为该线官方摄影
    "cur-19-5": "19",   # 朝天万世洞山：olle-19 主图即 Gimnyeong Maze Park，为该线官方摄影
    "cur-20-3": "20",   # 城势基草坪：olle-20 主图即 Sehwa jeju korea，为该线上的熔岩海岸
    "cur-21-1": "21",   # 别防镇：olle-21 主图即 Jeju Olle Route 21，为该线官方摄影
}

# ⚠️ 兜底登记：Commons 上**确实没有**该景点单独的风景照（多为小浦口、山峰、离岛、村落，
#    检索过了，无对应自由授权作品）。这里登记的是**同一条线路的沿线景观照**，不是该景点本身。
#    每条都要在 curated_sights.json 的 desc 里说明「此图为该线沿途景观，非景点实景」。
#    这样界面不留空洞，同时不会让人误以为图里就是那个景点。
SIGHT_FALLBACK: dict[str, str] = {
    # 01 号线（起终点一带）
    "cur-01-1": "01",   # 马尾峰 → 该线起点的城山日出峰一带视野
    "cur-01-3": "01",
    # 01-1 牛岛环岛
    "cur-01-1-2": "01-1",   # 珊瑚沙海滩 → 牛岛海岸景观
    "cur-01-1-3": "01-1",
    "cur-01-1-5": "01-1",
    # 02 号线
    "cur-02-2": "02",
    "cur-02-3": "02",
    # 03-A 山线
    "cur-03-A-1": "03-A",
    "cur-03-A-2": "03-A",
    # 04 号线灯塔海岸
    "cur-04-1": "04",
    "cur-04-2": "04",
    "cur-04-3": "04",
    "cur-04-4": "04",
    # 05 号线
    "cur-05-2": "05",
    # 06 号线西归浦市区段
    "cur-06-2": "06",
    "cur-06-3": "06",
    "cur-06-5": "06",
    # 07 号线
    "cur-07-3": "07",
    "cur-07-4": "07",
    # 07-1 号线
    "cur-07-1-1": "07-1",
    "cur-07-1-3": "07-1",
    # 08 号线
    "cur-08-4": "08",
    # 09 号线
    "cur-09-1": "09",
    "cur-09-3": "09",
    # 10 号线 / 加波岛
    "cur-10-3": "10",
    "cur-10-1-1": "10-1",
    "cur-10-1-2": "10-1",
    # 其余各线的零星一处
    "cur-11-2": "11",
    "cur-12-2": "12",
    "cur-13-1": "13",
    "cur-14-1-2": "14-1",
    "cur-15-A-2": "15-A",
    "cur-16-2": "16",
    "cur-18-2": "18",
    "cur-18-3": "18",
    # 楸子岛（18-1 / 18-2）
    "cur-18-1-1": "18-1",
    "cur-18-1-2": "18-1",
    "cur-18-1-3": "18-1",
    "cur-18-2-1": "18-2",
    # 19 号线
    "cur-19-2": "19",
    "cur-19-3": "19",
    "cur-19-4": "19",
    # 20 号线
    "cur-20-2": "20",
    "cur-20-4": "20",
    # 21 号线
    "cur-21-2": "21",
    "cur-21-3": "21",
}

# 看点 id -> 中文名（用于署名表与 CREDITS 可读性）
SIGHT_LABEL: dict[str, str] = {
    "cur-01-1": "马尾峰",
    "cur-06-1": "正房瀑布",
    "cur-07-1": "天地渊瀑布",
    "cur-07-2": "独立岩",
    "cur-08-1": "柱状节理带",
    "cur-10-2": "松岳山",
    "cur-11-1": "摹瑟峰",
    "cur-12-1": "水月峰",
    "cur-14-1": "翰林公园",
    "cur-14-1-1": "葛扎瓦",
    "cur-14-2": "飞扬岛",
    "cur-15-A-1": "挟才海滩",
    "cur-15-A-3": "郭支海边",
    "cur-16-3": "杭巴杜里杭蒙城遗址",
    "cur-17-2": "道头峰",
    "cur-19-1": "咸德海水浴场",
    "cur-19-5": "朝天万世洞山",
    "cur-20-1": "万丈窟",
    "cur-20-3": "城势基草坪",
    "cur-21-1": "别防镇",
}


def sight_id(code: str, idx: int) -> str:
    """复刻 build_sights_data.py 的 id 规则：cur-{code}-{序号（从 1 开始）}。

    curated_sights.json 的条目本身不带 id —— id 是生成 sightsData.ts 时按位置拼出来的，
    所以这里必须按同一规则复算，才能和 DEFAULT_SIGHTS 里的 Sight.id 对上。
    """
    return f"cur-{code}-{idx}"


def flat_sights() -> list[tuple[str, int, str, dict]]:
    """把 curated_sights.json 拍平成 (code, idx, sid, item)。sid 由位置复算得出。"""
    data = json.loads(open(SIGHTS_JSON, encoding="utf-8").read())
    out = []
    for code, items in data["sights"].items():
        for i, s in enumerate(items, 1):
            out.append((code, i, sight_id(code, i), s))
    return out


def local_result(sid: str, manifest: dict) -> tuple[dict | None, bool]:
    """--local：从 public/photos/manifest.json 复用已随仓库分发的 CC 图，不联网。

    返回 (结果, 是否兜底)。优先用 SIGHT_LOCAL 的精确匹配；Commons 上确实没有该景点
    单独照片的，走 SIGHT_FALLBACK 用**同条线路的沿线景观照**，同时要求调用方在文案里
    注明「此图为该线沿途景观，非景点实景」。两者都没登记则返回 (None, False)。
    """
    route = SIGHT_LOCAL.get(sid)
    is_fallback = False
    if not route:
        route = SIGHT_FALLBACK.get(sid)
        is_fallback = route is not None
    if not route or route not in manifest:
        return None, False
    v = manifest[route]
    rel = v.get("file", "")
    full = os.path.join(ROOT, "public", rel)
    if not rel or not os.path.exists(full):
        return None, False
    dims = webp_size(full) or (0, 0)
    artist, _, license_ = (v.get("credit", "") or "").partition(" / ")
    return {
        "file": rel,
        "w": dims[0],
        "h": dims[1],
        "title": v.get("title", ""),
        "artist": artist.strip(),
        "license": license_.strip(),
        "descpage": v.get("source", ""),
    }, is_fallback


def webp_size(path: str) -> tuple[int, int] | None:
    """读已存在 webp 的宽高（补齐 width/height）。Pillow 缺失或读不出时静默返回 None。"""
    try:
        from PIL import Image

        with Image.open(path) as im:
            return im.size
    except Exception:
        return None


def pick(opener, sight_id: str, sleep: float, used: set) -> tuple[dict | None, str | None]:
    for kw in SIGHT_QUERIES.get(sight_id, []):
        try:
            results = fp.search(opener, kw, WIDTH, code=None, used=used, sleep=sleep)
        except Exception as e:  # 单关键词失败不致命，换下一个词
            print(f"    search fail '{kw}': {e}", file=sys.stderr)
            continue
        if results:
            return results[0], kw
    return None, None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="", help="只抓这些看点 id，逗号分隔，如 cur-01-1,cur-15-1")
    ap.add_argument("--dry", action="store_true", help="只搜索不下载")
    ap.add_argument("--force", action="store_true", help="已存在的图也重新下载")
    ap.add_argument("--proxy", default="", help="如 http://127.0.0.1:7890，本机代理")
    ap.add_argument("--url", action="store_true",
                    help="不下载，直接把 Commons 缩略图 URL 写进 images（浏览器运行时直连）")
    ap.add_argument("--local", action="store_true",
                    help="完全不联网：直接复用 public/photos 里已有的 CC 图（仅精确匹配的看点，"
                         "见 SIGHT_LOCAL；没匹配的跳过）")
    ap.add_argument("--sleep", type=float, default=2.0, help="API 请求间隔秒数")
    ap.add_argument("--no-cache", action="store_true", help="不复用 scripts/.cache 里的检索结果")
    args = ap.parse_args()

    if not args.no_cache:
        fp.load_cache()
    fp._cache_on = not args.no_cache

    opener = fp.build_opener(args.proxy or None)
    os.makedirs(SIGHTS_OUT_DIR, exist_ok=True)

    all_sights = flat_sights()
    if args.ids:
        want = {x.strip() for x in args.ids.split(",") if x.strip()}
        targets = [t for t in all_sights if t[2] in want]
        unknown = want - {t[2] for t in all_sights}
        if unknown:
            print(f"警告：未知看点 id {', '.join(sorted(unknown))}"
                  f"（可用：{', '.join(t[2] for t in all_sights)}）", file=sys.stderr)
    else:
        if args.local:
            key_map: dict[str, object] = {**SIGHT_FALLBACK, **SIGHT_LOCAL}
            miss_hint = f"没有本地可复用图，已跳过（请在 SIGHT_LOCAL 登记）："
        else:
            key_map = SIGHT_QUERIES
            miss_hint = f"还没配检索词，已跳过（请在 SIGHT_QUERIES 补）："
        # 只处理登记过的看点；没登记的显式提示，避免静默跳过。
        targets = [t for t in all_sights if t[2] in key_map]
        no_query = [t[2] for t in all_sights if t[2] not in key_map]
        if no_query:
            print(f"提示：以下看点{miss_hint}{', '.join(no_query)}", file=sys.stderr)

    manifest: dict = {}
    if args.local:
        mp = os.path.join(ROOT, "public", "photos", "manifest.json")
        manifest = json.loads(open(mp, encoding="utf-8").read()) if os.path.exists(mp) else {}

    # 读入 curated_sights.json（原地回写 images）
    data = json.loads(open(SIGHTS_JSON, encoding="utf-8").read())

    used_titles: set[str] = set()
    credits: list[dict] = []
    n_done = 0
    failed: list[str] = []

    for code, idx, sid, s in targets:
        t0 = time.time()
        is_fallback = False
        if args.local:
            result, is_fallback = local_result(sid, manifest)
            kw = "(local-fallback)" if is_fallback else "(local)"
            if not result:
                failed.append(sid)
                print(f"[{sid}] 本地无可复用的精确匹配图，跳过")
                continue
            # 已有图的不覆盖：联网抓到的精确图优先于兜底的沿线景观
            # 但仍要把它记进署名表 —— 否则重跑时 credits 为空，
            # 署名表不会被重写，会一直停留在上一次的状态。
            if s.get("images") and not args.force:
                existing = s["images"][0]
                already_local = not existing.get("value", "").startswith("http")
                credits.append({
                    "id": sid,
                    "label": (SIGHT_LABEL.get(sid) or s.get("name") or sid)
                             + ("（沿线景观）" if already_local else ""),
                    "title": result["title"],
                    "artist": result["artist"],
                    "license": result["license"],
                    "source": result["descpage"],
                    "url": existing.get("value", ""),
                })
                print(f"[{sid}] 已有图，沿用（仅记署名）")
                continue
        else:
            result, kw = pick(opener, sid, args.sleep, used_titles)
            if not result:
                failed.append(sid)
                print(f"[{sid}] 无可用结果（{time.time()-t0:.1f}s）")
                continue

        if args.dry:
            print(f"[{sid}] 会选：{result['title'][:70]} | {result['license']} | kw={kw}")
            continue

        if args.local:
            ref = {
                "kind": "url",
                "value": result["file"],
                "width": result["w"],
                "height": result["h"],
            }
        elif args.url:
            ref = {
                "kind": "url",
                "value": result["thumb"],
                "width": result["w"],
                "height": result["h"],
            }
        else:
            dest = os.path.join(SIGHTS_OUT_DIR, f"{sid}.webp")
            rel = f"photos/sights/{sid}.webp"
            if os.path.exists(dest) and not args.force:
                print(f"[{sid}] 已有 {sid}.webp（--force 可重抓）")
                # 仍确保 curated_sights.json 里记录了 images（可能上次只下了图没写回）
                ref = {"kind": "url", "value": rel}
                dims = webp_size(dest)
                if dims:
                    ref["width"], ref["height"] = dims
            else:
                try:
                    _, _, size = fp.save_image(
                        opener, result, dest, None, WIDTH, QUALITY, 0, 0
                    )
                except Exception as e:
                    failed.append(sid)
                    print(f"[{sid}] 下载失败：{e}", file=sys.stderr)
                    continue
                ref = {
                    "kind": "url",
                    "value": rel,
                    "width": size[0],
                    "height": size[1],
                }
                print(f"[{sid}] {sid}.webp {size[0]}x{size[1]} | {result['license']} "
                      f"({time.time()-t0:.1f}s)")
            # 纳入去重，避免别处再选同一张
            used_titles.add(result["title"])

        # 回写 curated_sights.json 的这条看点 images
        item = data["sights"][code][idx - 1]
        item["images"] = [ref]
        # 兜底图必须在文案里讲明「这是沿线景观，不是这个景点」，否则等于骗人
        if args.local and is_fallback:
            NOTE = "（此图为该线路的沿途景观，非该景点实景）"
            if NOTE not in item.get("desc", ""):
                item["desc"] = (item.get("desc", "").rstrip() + NOTE)
                print(f"[{sid}] 兜底图，文案已加沿线说明")
        credits.append({
            "id": sid,
            # 缺省回落到数据里的真实名称，避免 SIGHT_LABEL 漏登记时署名表只剩一个 id
            "label": (SIGHT_LABEL.get(sid) or s.get("name") or sid)
                     + ("（沿线景观）" if (args.local and is_fallback) else ""),
            "title": result["title"],
            "artist": result["artist"],
            "license": result["license"],
            "source": result["descpage"],
            "url": ref["value"],
        })
        n_done += 1

    if args.dry:
        print("\n--dry：未下载、未改数据")
        fp.save_cache()
        return 0

    # 落盘 curated_sights.json
    json.dump(data, open(SIGHTS_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # 重新生成 src/lib/sightsData.ts（透传 images）
    try:
        import build_sights_data
        try:
            build_sights_data.main()
        except SystemExit:
            pass
    except Exception as e:
        print(f"重新生成 sightsData.ts 失败：{e}", file=sys.stderr)

    # 看点署名（独立文件，避免被 fetch_photos.py 重写的 CREDITS.md 冲掉）
    if credits:
        lines = [
            "# 看点封面署名（Sight Covers Credits）",
            "",
            "「人工补充看点」的封面图来自 Wikimedia Commons，均为 CC0 / CC-BY / CC-BY-SA / 公共领域等自由授权作品。",
            "",
            "⚠️ 标「（沿线景观）」的条目：Commons 上没有该景点单独的风景照，"
            "配的是**同一条线路的沿线景观照**，不是那个景点本身。",
            "",
            "⚠️ 这些都不是官方路线摄影，仅用于界面展示。",
            "",
            "| 看点 | 文件/链接 | 作者 | 许可 | 来源页 |",
            "| --- | --- | --- | --- | --- |",
        ]
        for c in credits:
            lines.append(
                f"| {c['label']} ({c['id']}) | {c['url']} | {c['artist'] or '—'} | {c['license'] or '—'} | {c['source'] or '—'} |"
            )
        lines.append("")
        lines.append("数据源：https://commons.wikimedia.org（CC0 / CC-BY / CC-BY-SA / 公共领域作品）")
        lines.append("")
        with open(CREDITS_SIGHTS, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

    fp.save_cache()
    print(f"\ndone: 处理 {len(targets)} 处看点，成功 {n_done} 处；"
          f"已回写 curated_sights.json / sightsData.ts" + (f"，未取到：{', '.join(failed)}" if failed else ""))
    if failed:
        print("未取到的可重跑本脚本补（或换 --proxy / --url）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
