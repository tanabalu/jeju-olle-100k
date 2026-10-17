#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性脚本：把 6 / 07 / 07-1 / 08 / 09 五条线的「主要看点」补进
scripts/data/curated_sights.json。

坐标来源同 add_curated_sights_east.py，用 coord_src 标注便于日后核对：
  - 'waypoint' ：复用官方航点 waypointsData.ts 的坐标（已吸附在真实轨迹上，可信度最高）
  - 'endpoint' ：官方起/终点真源 olle-endpoints.json 的钉死坐标
  - 'curated'  ：官方航点没列的知名景点，按公开资料给的坐标

id 由 build_sights_data.py 按序号生成，本脚本不写 id。
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "data" / "curated_sights.json"

ADDITIONS: dict[str, list[dict]] = {
    "06": [
        {
            "name": "济州小池（济姿池）Jejigi",
            "lng": 126.604252,
            "lat": 33.239264,
            "type": "water",
            "coord_src": "waypoint",
            "desc": "6 号线前半段的一座小火山锥，山顶有火口池，是这条路最值得爬的一处。"
                    "从山顶能同时看到西归浦市区与外海。",
        },
        {
            "name": "徐福公园・徐福展览馆 Xu Fu Park & Museum",
            "lng": 126.5615,
            "lat": 33.2469,
            "type": "village",
            "coord_src": "curated",
            "desc": "纪念传说中随秦始皇东渡、曾到过济州岛的徐福。展览馆展出徐福像、"
                    "秦始皇陵青铜马车与兵马俑坑的实物复品，设海岸观景台，"
                    "离正房瀑布约 150 米。开放 09:00–18:00，元旦与中秋当天闭馆，"
                    "门票免费。",
        },
        {
            "name": "西归浦每日偶来市场 Seogwipo Maeil Olle Market",
            "lng": 126.56322,
            "lat": 33.25015,
            "type": "village",
            "coord_src": "curated",
            "desc": "西归浦规模最大的传统市场，1960 年代形成，拱廊全长 620m，呈「王」字形布局。"
                    "卖济州柑橘、海产与街头小吃，室内有观赏用的人工水道。"
                    "夏季 07:00–21:00、冬季 07:00–20:00，全年无休，就在 6 号线终点。",
        },
    ],
    "07": [
        {
            "name": "独立岩 Oedolgae",
            "lng": 126.547588,
            "lat": 33.239505,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "高约 20m 的赭红色海蚀柱，因形似朝鲜半岛南部轮廓而得名，"
                    "涨潮时四周被海水围住、无法靠近，是西归浦海岸最具辨识度的景观，"
                    "电视剧《大长今》曾在此取景。观景步道就在其上方。",
        },
        {
            "name": "七十里诗公园・天地渊瀑布观景台 Seogwipo Poetry Park",
            "lng": 126.5556,
            "lat": 33.2494,
            "type": "water",
            "coord_src": "curated",
            "desc": "以「锦绣三韩」取名的市民公园，横跨溪谷，园内有亭台与桥梁步道。"
                    "从瀑布观景台可以俯瞰奔流的天地渊瀑布与下游的游园小径，"
                    "沿溪往东走就能到这条线的起点偶来旅行者中心。",
        },
        {
            "name": "西干岛 Seogeon-do",
            "lng": 126.511906,
            "lat": 33.240983,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "西归浦外海的一座小岛，退潮时沙洲与陆地相连、可以走过去，登顶再返回"
                    "需要约 1 小时。涨潮时海水隔开，只能远观。",
        },
        {
            "name": "济州世界杯竞技场 Jeju World Cup Stadium",
            "lng": 126.5092056,
            "lat": 33.2461389,
            "type": "other",
            "coord_src": "curated",
            "desc": "2002 年世界杯三场比赛的举办地，造型取自济州火山口，"
                    "屋顶用济州传统渔网作意象。7 号线从球场附近经过，"
                    "7-1 号线也以球场前广场作为一端的起点。",
        },
    ],
    "07-1": [
        {
            "name": "高根山 Gogeunsan",
            "lng": 126.513074,
            "lat": 33.266304,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "7-1 号线海拔最高处，也是全程唯一的大爬升，约 400m。"
                    "山顶可 360° 眺望西归浦市区与远处的汉拿山，"
                    "天气好时汉拿山顶的白云常像一顶帽子扣在山上。山顶有盖章点。",
        },
        {
            "name": "鹭岛瀑布 Eongtto-pokpo",
            "lng": 126.498309,
            "lat": 33.26776,
            "type": "water",
            "coord_src": "waypoint",
            "desc": "只有下雨或雨后才有水的季节性瀑布，两侧是陡峭的黑岩崖壁。"
                    "旱季来也能看到峡谷与岩壁本身，山下有柑橘园可以补给。",
        },
        {
            "name": "凤林寺 Bonglimsa",
            "lng": 126.539763,
            "lat": 33.251372,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "位于亚洲最大规模的沉没火山口（汉拿沉没火山）边缘。"
                    "这一带是济州少见的水田，秋收时节金色稻浪与四周黑色熔岩墙形成强烈对比。",
        },
        {
            "name": "可林生态公园 Geolmae Ecological Park",
            "lng": 126.55399,
            "lat": 33.246065,
            "type": "forest",
            "coord_src": "waypoint",
            "desc": "7-1 号线进入市区前的最后一段林间步道，溪流与林荫道相连，"
                    "全程最平缓的一段，适合放在下山后收尾。",
        },
    ],
    "08": [
        {
            "name": "药泉寺 Yakcheonsa",
            "lng": 126.44551,
            "lat": 33.245467,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "寺名来自附近的一眼矿泉。大雄宝殿高约 30 米，"
                    "供奉号称韩国最高的木雕佛与 8 万尊小佛像，"
                    "另有天然洞窟建成的讲堂（窟板堂）。可参加寺庙寄宿，需预约。",
        },
        {
            "name": "中文色达海水浴场 Jungmun Saekdal Beach",
            "lng": 126.411618,
            "lat": 33.256169,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "8 号线中途经过的中文地区沙滩。背后是酒店与度假村集中的区域，"
                    "补给和洗浴都方便，也是这条线上少有的能踩沙子的地方。",
        },
        {
            "name": "大坪浦口 Daepo Port",
            "lng": 126.436188,
            "lat": 33.237071,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "8 号线与 9 号线的分界所在，旁边有柱状节理带的登山口。"
                    "岸上有济州规模最大的综合休闲园区与马场。",
        },
    ],
    "09": [
        {
            "name": "火山岩岖海岸步道 Baksu-gijeong",
            "lng": 126.352854,
            "lat": 33.239292,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "9 号线难度「难」的来源：这段沿着熔岩岬角与海崖起伏行进，"
                    "路面崎岖、部分路段紧贴临空的崖边，视野开阔但要留意脚下。",
        },
        {
            "name": "月笼山 Weolla-bong",
            "lng": 126.360396,
            "lat": 33.252748,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "9 号线沿途登顶的小山，山顶有观景台与休息区，"
                    "旁边有金济窟可以下到熔岩洞里走一段。",
        },
        {
            "name": "和顺金沙滩 Hwasun Golden Sand Beach",
            "lng": 126.35146,
            "lat": 33.255702,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "9 号线终点。济州少见的金色沙滩，沙子含较多火山碎屑、"
                    "经日晒呈金黄色。沙滩一带也是这条线的偶来信息站。",
        },
    ],
}


def main() -> int:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    sights = data["sights"]

    for code, items in ADDITIONS.items():
        bucket = sights.setdefault(code, [])
        existing = {s["name"] for s in bucket}
        for item in items:
            if item["name"] in existing:
                print(f"  skip {code} {item['name']}（已存在）")
                continue
            bucket.append(item)
            print(f"  + {code} {item['name']}")

    for code, items in sights.items():
        for item in items:
            if "images" not in item:
                item["images"] = []

    SRC.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    total = sum(len(v) for v in sights.values())
    print(f"Wrote {SRC} | routes: {len(sights)} | total sights: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
