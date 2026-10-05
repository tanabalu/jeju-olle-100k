/**
 * 造测试数据的工厂。
 *
 * ## 为什么集中放这里
 * `Route` / `Plan` / `Hotel` 的必填字段很多（一个有 14 个），每个测试文件自己拼一遍
 * 既啰嗦又会让「改一个字段名要动十几个测试」。这里统一给默认值，
 * 测试里只写**跟这个用例有关的那几个字段** —— 一眼看得出在验什么。
 *
 * ## 纪律
 * - id 一律手写写死，不用 `uid()`：带随机值的 id 会让同一份输入产生不同的场景，
 *   断言就没法稳定，也让去重类用例（hotel.id 去重）失去意义。
 * - 坐标用真实量级的济州岛经纬度（约 lng 126.2~126.9 / lat 33.2~33.5），
 *   不要用 0/0 或 1/2：距离相关的断言（8km 候选半径、1km 接驳断口）会失效。
 */
import type { GeoPoint, Hotel, Plan, PlanItem, Route, RouteDirection, TrackPoint } from '../src/types'

/** 济州市厅一带的合适默认坐标 */
export const JEJU: GeoPoint = { lng: 126.5312, lat: 33.4996 }

/** 途经点。kind 默认 'via'，kind 只影响地图标记，多数用例不关心 */
export function pt(id: string, name: string, lng: number, lat: number, ele?: number): TrackPoint {
  const base: TrackPoint = { id, name, lng, lat, kind: 'via' }
  return ele === undefined ? base : { ...base, ele }
}

/** 路线。只传这次要验的字段，其余用稳态默认值补齐 */
export function route(p: Partial<Route> & Pick<Route, 'id'>): Route {
  const code = p.code ?? p.id
  const start = pt(`${p.id}-s`, `${code} 起点`, JEJU.lng, JEJU.lat)
  const end = pt(`${p.id}-e`, `${code} 终点`, JEJU.lng + 0.02, JEJU.lat + 0.01)
  return {
    name: `路线 ${code}`,
    code,
    region: '济州市',
    kind: 'hike',
    difficulty: 2,
    points: [start, end],
    tags: [],
    hotels: [],
    sights: [],
    album: [],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  }
}

/** 住宿。lng/lat 默认落在 JEJU 上，要测「离得多远」的用例自己传坐标 */
export function hotel(p: Partial<Hotel> & Pick<Hotel, 'id'>): Hotel {
  return { name: `住宿 ${p.id}`, ...JEJU, ...p }
}

/**
 * 离岛路线。
 *
 * ⚠️ 必须带 `离岛` tag：`dayPlan.isIslandRoute` 认的是 tags / region 里出现「离岛」，
 * 只写 `region: '牛岛'` 是判不出来的 —— 而判定失败会让「要不要赶末班船」的告警整个消失。
 */
export function islandRoute(p: Partial<Route> & Pick<Route, 'id'>): Route {
  return route({ ...p, tags: [...(p.tags ?? []), '离岛'] })
}

/** 行程篮的一条。day 省略 = 待安排 */
export function item(routeId: string, day?: number, direction?: RouteDirection): PlanItem {
  const base: PlanItem = { routeId }
  if (day !== undefined) base.day = day
  if (direction !== undefined) base.direction = direction
  return base
}

/** 行程篮 */
export function plan(p: Partial<Plan> & Pick<Plan, 'id'>): Plan {
  return {
    name: `行程篮 ${p.id}`,
    targetKm: 100,
    items: [],
    createdAt: 0,
    updatedAt: 0,
    ...p,
  }
}
