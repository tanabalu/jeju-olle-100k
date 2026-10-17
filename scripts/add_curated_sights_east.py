#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性脚本：把 1 / 1-1 / 02 / 03-A / 04 / 05 六条线的「主要看点」补进
scripts/data/curated_sights.json。

坐标来源分两类，都写进每条的 _coord_src 便于日后核对：
  - 'waypoint'：直接复用官方航点 waypointsData.ts 的坐标（已吸附在 public/tracks.json
    的真实轨迹上，可信度最高）；
  - 'curated'  ：官方航点没列的知名景点，按公开资料给的坐标录入（与本文件其余条目同等级）。

id 由 build_sights_data.py 按序号生成，本脚本不写 id。
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "data" / "curated_sights.json"

# code -> 追加的看点列表（name, lng, lat, type, coord_src, desc）
ADDITIONS: dict[str, list[dict]] = {
    "01": [
        {
            "name": "马尾峰 Malmi Oreum",
            "lng": 126.887871,
            "lat": 33.477629,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "1 号线起点的第一座山头，海拔不高但视野开阔：站上去能俯瞰始兴里的田野与黑色石篱，"
                    "正对城山日出峰，牛岛也在同一视野里。山顶是这条线路的盖章点之一。",
        },
        {
            "name": "城山日出峰 Seongsan Ilchul-bong",
            "lng": 126.935676,
            "lat": 33.462152,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "UNESCO 世界自然遗产「济州火山岛及熔岩洞窟」的一部分，500 多级台阶登顶，"
                    "火山口形如巨大的碗，是济州看日出最有名的地方。1 号线从东侧经过山脚，"
                    "不进山也能在沿线几处观景点看到全貌。",
        },
        {
            "name": "终达里海岸路（无障碍段）Jongdal Coastal Road",
            "lng": 126.900385,
            "lat": 33.492551,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "1 号线官方标注的轮椅可行路段，全长约 4.6km，从终达里旧盐滩走到城山闸门入口，"
                    "沿济州东岸最长最美的一段海岸公路，路面平坦、海景连续。"
                    "终点所在的旧盐滩（종달리 옛 소금밭）是济州传统制盐田遗迹，"
                    "旁边就是去牛岛的轮渡码头终达港。",
        },
        {
            "name": "光琪基海边 Gwangchigi Beach",
            "lng": 126.924201,
            "lat": 33.452006,
            "type": "view",
            "coord_src": "endpoint",
            "desc": "1 号线终点、2 号线起点。名字意为「盛满阳光的海滩」，"
                    "黑色火山熔岩与藻类覆盖的礁岩在退潮后泛出绿色，是这条线最值得等潮水的点；"
                    "官方明确建议退潮时来。崖顶是俯瞰城山日出峰与牛岛的经典机位。",
        },
    ],
    "01-1": [
        {
            "name": "牛岛峰（牛头峰）Udobong / Someorioreum",
            "lng": 126.96375,
            "lat": 33.49185,
            "type": "view",
            "coord_src": "curated",
            "desc": "牛岛唯一的爬升点，海拔约 132m，因整座岛像一头卧牛而得名「牛头峰」。"
                    "山顶能 360° 看到整座牛岛，向西可望汉拿山与城山日出峰，"
                    "登顶约需来回 1 小时，坡道较陡。",
        },
        {
            "name": "珊瑚沙海滩（西滨白沙）Seobinbaeksa",
            "lng": 126.944301,
            "lat": 33.498564,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "牛岛西岸的白沙海滩，沙子并非普通沙粒，而是钙化的红藻碎屑（珊瑚沙），"
                    "踩上去略粗。海水由白、天蓝、深蓝到墨绿层层过渡，是牛岛八景之一；"
                    "已被列为天然纪念物，禁止带走。",
        },
        {
            "name": "黑沙海滩（검멀레）Geommeolle Beach",
            "lng": 126.96855,
            "lat": 33.49673,
            "type": "view",
            "coord_src": "curated",
            "desc": "「검멀레」在济州方言里就是「黑沙」。牛岛峰脚下仅约 100m 长的小黑沙滩，"
                    "夹在火山岩崖之间，和白沙形成强烈对比。滩尽头有传说鲸鱼栖居过的东岸鲸窟，"
                    "涨潮时进不去，要退潮。",
        },
        {
            "name": "牛岛灯塔公园 Udo Lighthouse Park",
            "lng": 126.9652,
            "lat": 33.4929,
            "type": "view",
            "coord_src": "curated",
            "desc": "1906 年 3 月点亮的第一座灯塔，2003 年改建为白色圆形水泥塔，高 16m，已停用但可登。"
                    "山下路口处的灯塔公园是韩国第一座以灯塔为主题的公园，"
                    "陈列世界各地知名灯塔模型，也是电影《触不到的恋人》取景地。",
        },
        {
            "name": "海女潜水场 Haenyeo Submarine",
            "lng": 126.957624,
            "lat": 33.492759,
            "type": "other",
            "coord_src": "endpoint",
            "desc": "乘坐潜水船出海看济州海女下潜捕捞海产，是牛岛最经典的体验项目。"
                    "两个登船点：南侧天津港（하모니）与西侧下牛木洞港（아나리），"
                    "从城山浦过来的船两个港交替停靠。班次随季节调整，末班多在 17:00–18:30，"
                    "徒步环岛前务必先确认返程船。",
        },
    ],
    "02": [
        {
            "name": "大水山峰 Daesusan-bong",
            "lng": 126.900637,
            "lat": 33.439105,
            "type": "forest",
            "coord_src": "waypoint",
            "desc": "2 号线的制高点，海拔约 400m，是这条线上最大的一段爬升。登顶后视野从始兴一路铺到光琪基海边，"
                    "天气晴好时东海岸线一览无余。过了这个点往温坪方向，餐饮和补给基本消失，"
                    "官方建议在大水山之前就把午饭解决。",
        },
        {
            "name": "古城五日市场 Goseong 5-day Market",
            "lng": 126.9062,
            "lat": 33.4486,
            "type": "village",
            "coord_src": "curated",
            "desc": "古城邑里的乡村集市，逢每月 4、9、14、19、24、29 开市，营业约 08:00–14:00。"
                    "约 60 家摊位，卖青菜、海产、肉类、日用品与农具，另有乌麦年糕等地方吃食。"
                    "就在 2 号线沿线、大水山之前，是这条线最省事的补给与午饭点。",
        },
        {
            "name": "温坪浦口 Onpyeong Port",
            "lng": 126.904173,
            "lat": 33.405194,
            "type": "view",
            "coord_src": "endpoint",
            "desc": "2 号线终点、3 号线起点。沿岸是连绵的黑色熔岩海岸与浅水内湖，"
                    "退潮时能走到开阔的礁石地带，也是 3 号线分 A/B 两线的岔口所在。",
        },
    ],
    "03-A": [
        {
            "name": "通岳 Tongoreum",
            "lng": 126.854259,
            "lat": 33.396061,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "3 号线 A 线（山线）最有名的火山锥，官方在入口、顶、出口三处都设了航点。"
                    "9–10 月山脊开满紫花，是整条 3 号线色彩最集中的季节；"
                    "登顶步道不长但有起伏，往下可俯瞰周边海岸。",
        },
        {
            "name": "独子峰 Dokja-bong",
            "lng": 126.854233,
            "lat": 33.390754,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "通岳之后的第二座山头，海拔约 300m。官方同样标注了登山口与下山口两个航点，"
                    "这里是从内陆山线切回海岸的转折点，下到山脚即接新丰浦口一带的海景路段。",
        },
        {
            "name": "金永甲画廊 Gallery of Kim Young-gap",
            "lng": 126.858955,
            "lat": 33.376624,
            "type": "village",
            "coord_src": "waypoint",
            "desc": "摄影家金永甲的美术馆兼工作室，3 号线 A 线必经点。"
                    "展出的多为济州海岸与村落题材的作品，也能在露台看到附近海域。",
        },
        {
            "name": "表善海水浴场 Pyoseon Beach",
            "lng": 126.84249,
            "lat": 33.32553,
            "type": "view",
            "coord_src": "endpoint",
            "desc": "3 号线（A/B 两线共同）终点、4 号线起点，被称为济州最大的沙滩。"
                    "沙粒细、坡度缓，背后是成片的松林；岸边还有济州民俗村与国立民俗博物馆，"
                    "是这一带最完整的停留点。",
        },
    ],
    "04": [
        {
            "name": "新兴里浦口 Sinheung-ri Port",
            "lng": 126.766004,
            "lat": 33.297215,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "4 号线上第一个有灯塔的浦口，渔港外有堤防与灯塔。"
                    "沿岸是低矮的火山岩海岸与开阔海面，公路一侧不时出现面朝大海的咖啡馆。",
        },
        {
            "name": "德石浦口 Dukdol Port",
            "lng": 126.758877,
            "lat": 33.290624,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "德石浦口一带，靠近东部污水处理厂。浦口之间距离很近，"
                    "短短一段路连着几个小渔港，是 4 号线「灯塔海岸」最密集的一段。",
        },
        {
            "name": "太兴里浦口 Taeheung-ri Port",
            "lng": 126.752779,
            "lat": 33.287626,
            "type": "view",
            "coord_src": "waypoint",
            "desc": "4 号线上最有名的灯塔之一，旁边就是太兴里二里运动公园。"
                    "这里开始进入真正的南海岸村落段：石墙、晒渔网的院子、"
                    "以及沿海岸公路一字排开的咖啡馆都在步行范围内。",
        },
        {
            "name": "南元浦口 Namwon Port",
            "lng": 126.719698,
            "lat": 33.278124,
            "type": "view",
            "coord_src": "endpoint",
            "desc": "4 号线终点、5 号线起点，也是这条线的偶来信息站所在。"
                    "5 号线从这里出发不远就进入南元巨丘海岸的绝壁步道。",
        },
    ],
    "05": [
        {
            "name": "南元巨丘海岸 Keuneong Coastal Path",
            "lng": 126.6649,
            "lat": 33.2711,
            "type": "view",
            "coord_src": "curated",
            "desc": "5 号线最被称赞的一段：步道架在约 15 米高的熔岩绝壁之上，"
                    "沿途穿过亚热带林隧道，看海的角度与别处完全不同。"
                    "步道中段有一段树形隧道，枝干拼出的空隙正好是韩半岛轮廓，"
                    "是这条线的代表性拍照点。",
        },
        {
            "name": "为美山茶树群落 Camellia Habitat (Wimi-ri)",
            "lng": 126.677342,
            "lat": 33.272453,
            "type": "forest",
            "coord_src": "waypoint",
            "desc": "南元邑为美里一带的野生山茶树群落，花期 11 月至次年 2 月，"
                    "冬天来走这条线能看到成片山茶花。5 号线官方推荐季节就是冬季。",
        },
        {
            "name": "牛沼河口 Soesokkak",
            "lng": 126.622978,
            "lat": 33.251662,
            "type": "view",
            "coord_src": "endpoint",
            "desc": "5 号线终点。济州少见的淡水与海水交汇处，水面颜色分层，"
                    "岸边是宽阔的沙滩与玄武岩柱状节理地貌，"
                    "再往前就是 6 号线通往西归浦市区与正房瀑布的起点。",
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

    # 保持原有字段顺序：name / lng / lat / type / coord_src / desc / images
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
