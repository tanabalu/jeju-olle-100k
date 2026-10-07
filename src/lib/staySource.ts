/**
 * 住宿来源判定与合并（纯函数）。
 *
 * ## 为什么需要「来源」这个概念
 * 住宿有两个来源：
 * - **打包真源 bundle**：`src/data/stays.json`（OSM / TourAPI / 人工补录脚本产物），
 *   id 形如 `osm_node_xxx` / `tourapi_xxx` / `manual_xxx`。
 * - **后台手填**：素材后台「添加住宿」按钮建的，`emptyHotel()` 用 `uid('hotel')`，
 *   id 形如 `hotel_xxx`。
 *
 * 真源是权威：bundle 里改了就跟着改，bundle 里**删了就该一起消失**。
 *
 * ## 踩过的坑（2026-10-07）
 * 删掉 854 条无中英文名的抓取住宿后，行程篮的推荐列表里它们还在。
 * 根因：旧判定是「id 不在全局 bundle 集合里 = 后台手填，保留」—— 被删的那些 id
 * 恰好**不在** bundle 里，于是全被当成手填留下了。
 * 所以改成**按 id 命名空间判定来源**，而不是「当前 bundle 里有没有」。
 */
import type { Hotel, Route } from '../types'

/** 打包真源（抓取 / 补录脚本）使用的 id 前缀 */
export const BUNDLE_ID_PREFIXES = ['osm_', 'tourapi_', 'kakao_', 'manual_'] as const

/**
 * 这条住宿是不是 bundle 来源 —— 是的话，去留一律随 bundle：
 * bundle 里有就是它，bundle 里删了就是不想要了。
 */
export function isBundleStay(id: string): boolean {
  return BUNDLE_ID_PREFIXES.some((p) => id.startsWith(p))
}

/**
 * 把「官方建议住这的城镇」的住宿池合并进路线（不落库，对齐 mergeAssets 范式）。
 * 严格按 routeTowns 映射收集；跨城镇去重按 hotel.id，避免同一家被挂多次。
 *
 * ## 对账而不是追加
 * bundle 始终为权威：这条路线官方建议的城镇对应的住宿取**最新打包数据**；
 * 只保留「后台手填」的住宿（不随 bundle 刷新、也不会被误删）。
 * 这样 reload 即可反映最新 `stays.json`，又不会丢素材管理里手补的住宿。
 */
export function mergeStays(
  route: Route,
  townsByKo: Record<string, Hotel[]>,
  routeTowns: Record<string, string[]>,
  bundleIds: Set<string>,
): Route {
  const codes = route.code ? routeTowns[route.code] : undefined
  // 这条路线官方建议住的城市对应的住宿（始终取最新打包数据，刷新即生效）
  const bundle: Hotel[] = []
  const seen = new Set<string>()
  for (const ko of codes ?? []) {
    for (const h of townsByKo[ko] ?? []) {
      if (h.id && !seen.has(h.id)) {
        seen.add(h.id)
        bundle.push(h)
      }
    }
  }
  // 只留后台手填：bundle 命名空间下的 id（osm_/tourapi_/kakao_/manual_）一律以 bundle 为准，
  // bundle 里没有 = 真源已删，不能当手填留着。
  const manualOnly = route.hotels.filter((h) => h.id && !bundleIds.has(h.id) && !isBundleStay(h.id))
  const next = [...bundle, ...manualOnly]
  // 内容（含顺序）与现有一致就不新建 route 对象，避免每次渲染都触发下游 memo 重算
  if (next.length === route.hotels.length && next.every((h, i) => h === route.hotels[i])) {
    return route
  }
  return { ...route, hotels: next }
}
