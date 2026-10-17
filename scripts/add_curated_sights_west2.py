#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性脚本：把 10 / 10-1 / 11 / 12 / 13 / 14 / 14-1 / 15-A / 16 / 17 / 18 /
18-1 / 19 / 20 / 21 的「主要看点」补进 scripts/data/curated_sights.json。

坐标来源用 coord_src 标注：
  - 'waypoint' ：官方航点 waypointsData.ts 的坐标（已吸附真实轨迹，可信度最高）
  - 'endpoint' ：官方起/终点真源 olle-endpoints.json
  - 'curated'  ：公开资料坐标（官方航点未列的景点）

id 由 build_sights_data.py 按序号生成，本脚本不写 id。幂等：同名 skip。
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "data" / "curated_sights.json"

ADDITIONS: dict[str, list[dict]] = {
    "10": [
        {
            "name": "山房山・龙头海岸 Sangumban & Yongduam",
            "lng": 126.25279,
            "lat": 33.21915,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "10 号线西南端的代表景观。山房山是济州最古老的火山岩层露头之一，"
                    "龙头海岸紧邻其下，熔岩崖直接落海。"
                    "沿线经过泊砚寺与山房古生物化石产地，后者是济州重要的地质遗产。",
        },
        {
            "name": "松岳山 Songaksan",
            "lng": 126.291417,
            "lat": 33.195984,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "俯瞰山房与龙头海岸的绝佳位置，山顶有停车场可徒步上行。"
                    "山脚下是沙也质遗址一带。",
        },
        {
            "name": "兄弟岛 Hyodo & Meokdo 眺望",
            "lng": 126.293744,
            "lat": 33.216646,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "沙也浦外海的两座小岛，退潮时与陆地以沙洲相连，"
                    "是济州少见的可徒步步道。",
        },
    ],
    "10-1": [
        {
            "name": "上洞奶奶堂 Haenyeo Halmeoni Hut",
            "lng": 126.265484,
            "lat": 33.171094,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "加波岛上的海女文化象征。这座石顶草房是当年海女居住与储物的场所，"
                    "如今是岛上的必访点。从摹瑟浦港坐船约 10 分钟到岛，"
                    "而加波岛是韩国最南端的有人岛。",
        },
        {
            "name": "开严朱里可支 Gaeumjoori Koji",
            "lng": 126.274012,
            "lat": 33.174009,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "岛东侧的火山岩海岬，是看济州本岛南岸与海上日出的位置。"
                    "岛上最高点只有 20m 左右，全程平缓无爬升。",
        },
        {
            "name": "加波初等学校 Gapa Elementary School",
            "lng": 126.269827,
            "lat": 33.169219,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "岛上唯一的学校，周边是加波岛的生活中心。"
                    "荷兰航海家海姆尔（Hameln）17 世纪初曾流落岛上，岛上有其纪念像。",
        },
    ],
    "11": [
        {
            "name": "摹瑟峰 Moseul-bong",
            "lng": 126.260665,
            "lat": 33.239692,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "11 号线的主要爬升段，登顶后可俯瞰摹瑟浦与外海。"
                    "从山顶下到山脚再回到海边的这段是全线起伏最大的地方。",
        },
        {
            "name": "咸慕体育公园 Hamo Sports Park",
            "lng": 126.244552,
            "lat": 33.27741,
            "type": "other",
            "coord_src": "waypoint",
            "desc": "11 号线中段的运动公园，可作为休息与补给点。"
                    "这条线以西海岸原生地貌为主，沿途设施稀少，出发前建议备齐补给。",
        },
    ],
    "12": [
        {
            "name": "水月峰 Suweol-bong",
            "lng": 126.164779,
            "lat": 33.29587,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "12 号线的主要爬升点，山顶有六角亭。"
                    "峰体由层叠的火山岩构成，是 UNESCO 世界地质公园认证的观察点，"
                    "能看到岩层断面的柱状节理走向。",
        },
        {
            "name": "遮归岛 Jagyuk-do 眺望",
            "lng": 126.167291,
            "lat": 33.315631,
            "type": "other",
            "coord_src": "waypoint",
            "desc": "12 号线靠海一段能望见的离岛。沿线还经过城伊志绝壁，"
                    "崖面直切向海。官方在此段标注了轮椅可行的区间。",
        },
    ],
    "13": [
        {
            "name": "奈川里「椅子村」Nakcheon-ri Chair Park",
            "lng": 126.225835,
            "lat": 33.326924,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "13 号线最有辨识度的停留点：村民把各种形状的石头、旧椅子和杂物"
                    "摆在路旁与空地上做装饰，形成「椅子村」。"
                    "沿线还有古树群与石墙小径，是西海岸传统村落的代表。",
        },
    ],
    "14": [
        {
            "name": "金银海岸 Geumneung Beach",
            "lng": 126.241774,
            "lat": 33.395304,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "14 号线沿途的金银海岸，是翰林一带海岸的代表。"
                    "沿线还有仙人掌栖息地与海女文化相关的老房子，"
                    "翰林港是全线终点与去飞扬岛的乘船点。",
        },
    ],
    "14-1": [
        {
            "name": "葛扎瓦 Jeoji Gotjawal",
            "lng": 126.289392,
            "lat": 33.331491,
            "type": "forest",
            "coord_src": "waypoint",
            "desc": "济州少见的原始密林，14-1 号线与 13 号线共有的路段。"
                    "林内光线昏暗、地面湿滑，走这段要放慢脚步。",
        },
        {
            "name": "文道之岳 Mundoji Oreum",
            "lng": 126.294794,
            "lat": 33.326978,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "14-1 号线唯一的爬升点，入口与山顶都有标记。"
                    "翻过这个山头就下到西归浦一侧。",
        },
        {
            "name": "O'Sulloc 雪绿茶田 O'Sulloc Green Tea Fields",
            "lng": 126.286276,
            "lat": 33.307602,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "14-1 号线终点一带。整齐的茶垄铺在缓坡上，"
                    "终点就是 O'Sulloc 雪绿茶博物馆，可以进去喝一杯再走。"
                    "全线无餐厅，出发前要自带补给。",
        },
    ],
    "15-A": [
        {
            "name": "仙云精舍寺 Youngung-sa",
            "lng": 126.313129,
            "lat": 33.429635,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "15 号线 A 线（内陆山线）沿途的古寺，供奉 11 世纪高丽佛像。"
                    "A 线从翰林翻过中山间松林到高内，B 线则全程走海岸。",
        },
        {
            "name": "郭支海边 Gwakji Beach",
            "lng": 126.313406,
            "lat": 33.432638,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "15 号线 A 线沿途的沙滩，与仙云精舍寺相邻。"
                    "A 线翻过中山间松林到高内，B 线则全程走海岸、不经此处。",
        },
    ],
    "16": [
        {
            "name": "旧邑渔村・苏金比尔盐田 Gueom-ri & Guesucheol Salt Field",
            "lng": 126.377865,
            "lat": 33.483095,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "16 号线上文化含量最高的一段：紧邻旧邑渔村有一片复原的传统盐田，"
                    "济州自 1559 年起在此晒盐。沿崖顶的涯月海岸公路是济州最美海岸公路之一，"
                    "秋季沿岸可见波斯菊。",
        },
        {
            "name": "水山峰・水山贮水池 Susan-bong & Reservoir",
            "lng": 126.384233,
            "lat": 33.472701,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "16 号线翻越的山头与山下的贮水池。官方标注了贮水池附近的"
                    "高潮位绕行段，退潮时才走得通。",
        },
        {
            "name": "杭巴杜里杭蒙城遗址 Hangpaduri",
            "lng": 126.41282,
            "lat": 33.452514,
            "type": "ruin",
            "coord_src": "waypoint",
            "desc": "高丽王朝为抵抗蒙古而修筑的城址遗址，位于 16 号线中段。"
                    "沿线还是这条线少有的有平地路段。",
        },
    ],
    "17": [
        {
            "name": "阿尔作支卵石海岸 Aljakji Pebbles Beach",
            "lng": 126.450391,
            "lat": 33.496867,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "由黑色火山卵石铺成的海岸，是济州的自然纪念物。"
                    "17 号线在此贴着海岸走，是全线最特别的一段。",
        },
        {
            "name": "道头峰 Dodu-bong",
            "lng": 126.478586,
            "lat": 33.509142,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "17 号线的主要爬升段，山顶可俯瞰济州市与东海。"
                    "下山后进入市区方向，终点是金万德纪念馆。",
        },
    ],
    "18": [
        {
            "name": "纱罗峰 Wondang-bong",
            "lng": 126.598746,
            "lat": 33.529099,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "18 号线的主要爬升点，日落景观入选济州十景。"
                    "山顶能同时看到东海海岸线与远处的大海。",
        },
        {
            "name": "三阳黑沙滩 Samyang Beach",
            "lng": 126.588555,
            "lat": 33.528392,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "18 号线中段的黑色火山砂海滩，滩涂较宽、退潮时能走得远。"
                    "沿线还有别岛峰（小岛）与多处海岸洞穴。",
        },
        {
            "name": "建入洞村落遗址 Goneul-dong",
            "lng": 126.564169,
            "lat": 33.524488,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "济州 4·3 事件的历史现场之一，18 号线起点附近的村落，"
                    "沿路保留了当时的遗迹。",
        },
    ],
    "18-1": [
        {
            "name": "凤来山 Bongeulle-san",
            "lng": 126.288274,
            "lat": 33.965414,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "上楮子的主要爬升点，官方在登山口与下山处都设了标记。"
                    "18-1 号线难度为「难」，起伏大。",
        },
        {
            "name": "顿台山 Dondae-san",
            "lng": 126.30439,
            "lat": 33.952787,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "上楮子另一座山头，官方航点在山腰与山顶各有一处标记。"
                    "山顶视野把整个楮子岛与本岛北缘一并收进来。",
        },
        {
            "name": "新洋港 Sinyang-hang",
            "lng": 126.330887,
            "lat": 33.953229,
            "type": "other",
            "coord_src": "waypoint",
            "desc": "上楮子主要的港口与补给点，官方航点标注有便利店与咖啡厅。"
                    "干黄花鱼等渔村风味在这里吃。",
        },
    ],
    "18-2": [
        {
            "name": "石德青山亭 Seokdeok Cheongsanseong",
            "lng": 126.296266,
            "lat": 33.963322,
            "type": "view",
            "coord_src": "endpoint",
            "desc": "18-2 号线（下楮子）的主要看点，楸子十景之一。"
                    "下楮子与上楮子是两座岛，往返船分开，出发前要确认自己在哪座岛上。",
        },
    ],
    "19": [
        {
            "name": "朝天万世洞山 Jeon Mangjeol",
            "lng": 126.653607,
            "lat": 33.547636,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "19 号线沿线的抗日独立运动遗址与纪念馆所在，"
                    "官方航点把纪念馆与新兴里白沙滩一并标出。"
                    "沿线还有济州国立大学海洋与自然研究所。",
        },
    ],
    "20": [
        {
            "name": "月汀里海岸 Meomjilri",
            "lng": 126.758313,
            "lat": 33.557123,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "20 号线上翡翠海颜色最正的一段海滩，"
                    "岸边成排咖啡馆，是这条线最值得慢下来的地方。"
                    "官方航点在 1.4km 处还标了一家咖啡店。",
        },
        {
            "name": "城势基草坪 Seomokjae",
            "lng": 126.796889,
            "lat": 33.555434,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "20 号线中段的黑色岩石海蚀平台，退潮时能走得很远，"
                    "是济州最具代表性的熔岩海岸之一。",
        },
        {
            "name": "杏源浦口・汉东海岸路 Haengwon-pogu & Handong Seaside Road",
            "lng": 126.807742,
            "lat": 33.55658,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "20 号线的后段：杏源浦口往北转入汉东海岸公路，"
                    "沿岸是开阔的东海海面，终点是下道的济州海女博物馆。",
        },
    ],
    "21": [
        {
            "name": "别防镇 Byeolbangjin",
            "lng": 126.883313,
            "lat": 33.525671,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "朝鲜时代为防备倭寇而修筑的海岸城墙遗址，"
                    "21 号线起点附近的重要历史遗迹。",
        },
        {
            "name": "地尾峰 Jimi-bong",
            "lng": 126.908388,
            "lat": 33.496187,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "21 号线的主要爬升点，官方在登山口与山顶都设了标记。"
                    "山顶可俯瞰牛岛、城山日出峰与马尾峰，是把 1 号线和 1-1 号线"
                    "的景观一次看完的地方。",
        },
        {
            "name": "终达海滩 Hado Beach",
            "lng": 126.900312,
            "lat": 33.509232,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "21 号线终点，宁静的黑色火山砂海滩，"
                    "也是去牛岛的另一处乘船点（终达港）。",
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

    for items in sights.values():
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
