/**
 * 行程篮的「按天排期」计算层（纯函数，不碰 React、不落库）。
 *
 * ## 口径
 * - **耗时是估算值**：`里程 / 3.6km/h + 累计爬升 / 450m/h`（爬升按每小时 450m 折算额外时间）。
 *   官方详情页另有更准的建议耗时，这里只用于「这天是不是太重了」的判断，
 *   界面上一律写「约 XX」，不能当成时刻表用。
 * - **里程**沿用 `computeMetrics` 的生效里程（手填 > 真实轨迹 > 直线 × 绕行系数），
 *   由调用方传进来，这里不做第二套计算。
 * - **同一天内的顺序 = items 数组的先后顺序**：没有单独的 order 字段，
 *   避免「按加入顺序」和「第 N 天里的第几条」变成两套互相打架的真相。
 */
import type { GeoPoint, Plan, PlanItem, Route, RouteDirection, RouteMetrics, TrackPoint } from '../types'
import { haversineKm } from './geo'

/** 行程篮里一条已解析的路线（找不到对应 Route 的脏 item 会被丢掉） */
export interface PlanRow {
  item: PlanItem
  route: Route
  km: number
  /** 无海拔数据时为 null —— 不能当成 0，否则「没采集」会显示成「爬升 0」 */
  gainM: number | null
  done: boolean
}

export type DayWarningKind = 'overload' | 'light' | 'gap' | 'island'

export interface DayWarning {
  kind: DayWarningKind
  text: string
}

export interface DayPlan {
  day: number
  rows: PlanRow[]
  distanceKm: number
  gainM: number | null
  /** 估算纯步行时长（小时），不含休息与交通 */
  hours: number
  /** 当天最难的那条的难度（1-5） */
  difficultyMax: number
  isFirst: boolean
  isLast: boolean
  hasIsland: boolean
  /** 与**前一天**终点的直线断口（km）；接得上就是 undefined */
  transferGapKm?: number
  warnings: DayWarning[]
  dateLabel?: string
  weekday?: string
  dateISO?: string
}

/** 单日里程上限 / 时长上限，超过就提示这天太重 */
export const DAY_KM_LIMIT = 20
export const DAY_HOURS_LIMIT = 6.5
/** 低于这个里程且不是首尾日，提示可以再塞一条 */
export const DAY_KM_LIGHT = 5
/** 超过这个直线距离就认为「接不上，要坐车」 */
export const TRANSFER_GAP_KM = 1

/** 估算耗时（小时）：平地 3.6km/h + 爬升补偿 */
export function estimateHours(km: number, gainM: number | null): number {
  const g = gainM && Number.isFinite(gainM) ? Math.max(0, gainM) : 0
  return km / 3.6 + g / 450
}

/** 把估算小时数写成「4h35m」（不足 1 小时只写分钟） */
export function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '—'
  const H = Math.floor(h)
  const M = Math.round((h - H) * 60)
  const mm = M === 60 ? 0 : M
  const carry = M === 60 ? 1 : 0
  const hh = H + carry
  return hh > 0 ? `${hh}h${String(mm).padStart(2, '0')}m` : `${mm}m`
}

/**
 * 当天「收工」锚定时刻（小数小时）：一天一条线按 16:00，两条及以上按 17:00。
 * 起床时间由收工时刻倒推（见 dayWakeH），而不是像 tripPlans 那样从开走时刻倒推。
 */
export function dayFinishH(rowCount: number): number {
  return rowCount <= 1 ? 16 : 17
}

/** 小数小时 + 增量 → 新的小数小时（允许超过 24，由 fmtClock 取模处理跨午夜） */
export function addHours(baseH: number, add: number): number {
  return baseH + add
}

/** 小数小时 → "HH:MM"（按 24h 取模，跨午夜仍尽量可读） */
export function fmtClock(h: number): string {
  const total = Math.round(h * 60)
  const hh = Math.floor(((total / 60) % 24 + 24) % 24)
  const mm = ((total % 60) + 60) % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** 起床 → 出发的缓冲（含早餐与去程），小时 */
export const WAKE_BUFFER_H = 2.5

/**
 * 起床时刻 = 收工时刻 − 总步行估算时长 − 缓冲。
 * 例：一天一条线、约 4h 步行 → 16:00 − 4h − 2.5h = 09:30 起床；
 *     两条线、约 6h 步行 → 17:00 − 6h − 2.5h = 08:30 起床。
 */
export function dayWakeH(hours: number, rowCount: number): number {
  return dayFinishH(rowCount) - hours - WAKE_BUFFER_H
}

/** 出发时刻 = 起床 + 缓冲；也等于 收工 − 总步行时长（逐段累加后最后一段正好落在收工时刻） */
export function dayDepartureH(hours: number, rowCount: number): number {
  return dayWakeH(hours, rowCount) + WAKE_BUFFER_H
}

/**
 * 离岛路线判定（牛岛 / 加波岛 / 楮子岛那几条分支线）。
 *
 * 必须单独识别：离岛要坐船，错过末班船当晚只能住岛上 ——
 * 「每晚推荐住宿」的规则在这里会被强制改判（见 stayMatch.ts 的规则 2）。
 * 判定用 tags / region 两个来源兜底，因为这两处的写法历史上并不统一。
 */
export function isIslandRoute(route: Route): boolean {
  if ((route.tags ?? []).includes('离岛')) return true
  return (route.region ?? '').includes('离岛')
}

/**
 * 离岛进出需要的「额外时间」：买票 + 排队 + 坐船岛上来回。
 *
 * 这些是经验估算（非官方时刻表），用于在行程单上把离岛天的总占用时长算足 ——
 * 否则只算岛上限步会严重低估（尤其楮子岛，单程船就约 1 小时）。
 * 各岛数值可调；船班受季节 / 潮汐影响很大，最终以出发前实际船班为准。
 */
export const ISLAND_TICKET_QUEUE_H = 0.5 // 买票 + 排队（一次性，不分往返）

/** 各岛「坐船往返」经验时长（小时）：单程 ×2 */
const ISLAND_FERRY_RT_H: Record<string, number> = {
  udo: 0.5, // 牛岛：单程约 15 分钟
  gapado: 0.7, // 加波岛：单程约 20 分钟
  chuja: 2.5, // 楮子岛：单程约 75 分钟
}
const ISLAND_FERRY_RT_DEFAULT_H = 0.75 // 未知离岛的兜底往返时长

/** 从 region / tags 解析离岛 key（udo / gapado / chuja） */
export function islandKey(route: Route): string | undefined {
  const hay = `${route.region ?? ''} ${route.tags?.join(' ') ?? ''}`
  if (hay.includes('牛岛')) return 'udo'
  if (hay.includes('加波')) return 'gapado'
  if (hay.includes('楮子')) return 'chuja'
  return undefined
}

/** 离岛中文名（用于行程单标注） */
export function islandZh(route: Route): string {
  const k = islandKey(route)
  if (k === 'udo') return '牛岛'
  if (k === 'gapado') return '加波岛'
  if (k === 'chuja') return '楮子岛'
  return '离岛'
}

/** 单条离岛线的「坐船往返」时长（小时） */
export function islandFerryRtH(route: Route): number {
  const k = islandKey(route)
  return k ? ISLAND_FERRY_RT_H[k] ?? ISLAND_FERRY_RT_DEFAULT_H : ISLAND_FERRY_RT_DEFAULT_H
}

/** 单条离岛线的额外总时长 = 买票+排队 + 坐船往返 */
export function islandExtraH(route: Route): number {
  if (!isIslandRoute(route)) return 0
  return ISLAND_TICKET_QUEUE_H + islandFerryRtH(route)
}

/** 当天所有离岛线的额外总时长 */
export function dayIslandExtraH(rows: PlanRow[]): number {
  return rows.reduce((s, r) => s + islandExtraH(r.route), 0)
}

/**
 * 路线的实际起点/终点：权威起终点字段优先，其次结算出来的轨迹端点。
 *
 * @param direction 行走方向。`reverse`（反穿）时把首尾端点对调——
 *   当天「从哪出发 / 到哪结束」随之翻转，接力断口、当晚住宿位置、次日出发点都会跟着变。
 *   缺省 'forward'（正穿），兼容旧调用与只看官方正穿的场合（路线详情页）。
 */
export function routeEnds(
  route: Route,
  m?: RouteMetrics,
  direction: RouteDirection = 'forward',
): { start?: TrackPoint; end?: TrackPoint } {
  const pts = route.points ?? []
  const fwd = {
    start: route.startPoint ?? m?.startPoint ?? pts[0],
    end: route.endPoint ?? m?.endPoint ?? (pts.length ? pts[pts.length - 1] : undefined),
  }
  if (direction === 'reverse') return { start: fwd.end, end: fwd.start }
  return fwd
}

/** 把 plan.items 解析成带 Route 的行；缺 Route 或值为空的行被丢掉 */
export function planRows(
  plan: Plan | undefined,
  routes: Route[],
  metrics: Map<string, RouteMetrics>,
): PlanRow[] {
  if (!plan) return []
  const out: PlanRow[] = []
  for (const item of plan.items ?? []) {
    const route = routes.find((r) => r.id === item.routeId)
    if (!route) continue
    const m = metrics.get(route.id)
    const km = m?.distanceKm ?? 0
    out.push({ item, route, km, gainM: m?.gainM ?? null, done: !!item.done })
  }
  return out
}

/** 行程篮实际有哪些天：取「item 的最大天号」与「显式 dayCount」的较大者 */
export function planDayNumbers(plan: Plan | undefined): number[] {
  if (!plan) return []
  const fromItems = (plan.items ?? []).map((i) => i.day).filter((d): d is number => typeof d === 'number')
  const max =
    Math.max(plan.dayCount ?? 0, fromItems.length ? Math.max(...fromItems) : 0)
  if (max < 1) return []
  return Array.from({ length: max }, (_, i) => i + 1)
}

/**
 * 出发日 + 第 N 天 → 日期标签。
 * 按**本地时区**手拼，不用 `toISOString()`：后者会先转成 UTC，
 * 在东八区会把日期整体倒退一天（行程单上写 10/2、面板上写 10/3 的那种离谱 bug）。
 */
export function dayDate(startDate: string | undefined, day: number):
  | { iso: string; label: string; weekday: string }
  | undefined {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return undefined
  const base = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(base.getTime())) return undefined
  base.setDate(base.getDate() + day - 1)
  const p = (n: number) => String(n).padStart(2, '0')
  const iso = `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`
  return {
    iso,
    label: `${base.getMonth() + 1}/${base.getDate()}`,
    weekday: `周${'日一二三四五六'[base.getDay()]}`,
  }
}

/**
 * 按天聚合 + 校验。
 *
 * `metrics` 传进来是为了复用页面上已经算好的那份（`computeMetrics` 不便宜，
 * 一条路线要跑几万个点，不要在这里再算一遍）。
 */
export function planDays(
  plan: Plan | undefined,
  rows: PlanRow[],
  metrics: Map<string, RouteMetrics>,
  /** 某天锁定的住宿坐标（day → 坐标）；有则从住宿点算接驳距离，没有才从当天路线终点算 */
  dayStayGeo?: Map<number, GeoPoint>,
): DayPlan[] {
  const nums = planDayNumbers(plan)
  return nums.map((day) => {
    const dayRows = rows.filter((r) => r.item.day === day)
    const distanceKm = dayRows.reduce((s, r) => s + r.km, 0)
    const gains = dayRows.map((r) => r.gainM).filter((g): g is number => typeof g === 'number' && Number.isFinite(g))
    const gainM = gains.length ? gains.reduce((a, b) => a + b, 0) : null
    const difficultyMax = Math.max(0, ...dayRows.map((r) => r.route.difficulty ?? 0))
    const hasIsland = dayRows.some((r) => isIslandRoute(r.route))

    // 接力断口：前一天「住哪」↔ 当天的起点（前一天不存在就不判断）。
    // 两端都按各自当天的行走方向取，反穿会让「当天起点」落到官方终点那端。
    // 前一天若锁定了住宿，从住宿点算接驳距离（人睡在那，不是睡在路线终点）；
    // 没选住宿才回退到当天路线终点。
    let transferGapKm: number | undefined
    const prevStay = dayStayGeo?.get(day - 1)
    const prevRows = rows.filter((r) => r.item.day === day - 1)
    if (day > 1 && prevRows.length && dayRows.length) {
      const prevLast = prevRows[prevRows.length - 1]
      const curFirst = dayRows[0]
      const prevEnd = routeEnds(prevLast.route, metrics.get(prevLast.route.id), prevLast.item.direction).end
      const curStart = routeEnds(curFirst.route, metrics.get(curFirst.route.id), curFirst.item.direction).start
      const fromGeo = prevStay ?? (prevEnd ? toGeo(prevEnd) : undefined)
      if (fromGeo && curStart) {
        const gap = haversineKm(fromGeo, toGeo(curStart))
        if (gap > TRANSFER_GAP_KM) transferGapKm = gap
      }
    }

    const isFirst = day === nums[0]
    const isLast = day === nums[nums.length - 1]
    const warnings: DayWarning[] = []
    if (transferGapKm !== undefined) {
      warnings.push({
        kind: 'gap',
        text: `与第 ${day - 1} 天有 ${transferGapKm.toFixed(1)} km 断口 —— ${
          prevStay ? '前一天住宿点' : '昨天终点'
        }不是今天起点，需要坐车接驳。`,
      })
    }
    if (hasIsland) {
      // 只说风险，不说「住岛上」：官方口径里牛岛这类短程离岛本来就是建议回城山住，
      // 具体住哪由 stayMatch 给建议，别在这里抢答。
      warnings.push({
        kind: 'island',
        text: '含离岛路线 —— 需要坐船进出，首末班船时间务必提前确认（错过当晚只能在岛上过夜）。',
      })
    }
    if (distanceKm > DAY_KM_LIMIT || estimateHours(distanceKm, gainM) > DAY_HOURS_LIMIT) {
      warnings.push({
        kind: 'overload',
        text: `这天偏重：${distanceKm.toFixed(1)} km / 约 ${formatHours(estimateHours(distanceKm, gainM))} —— 建议拆成两天，或把其中一段挪到别天。`,
      })
    }
    if (distanceKm > 0 && distanceKm < DAY_KM_LIGHT && !isFirst && !isLast) {
      warnings.push({ kind: 'light', text: `这天只有 ${distanceKm.toFixed(1)} km，可以再安排一条短线。` })
    }
    // ⚠️ 不要在这里加「最后一天不安排住宿」的提示：最后一晚照样要给住宿建议
    // （走完当天当晚仍要落脚，多半第二天才返程），这条规则由 stayMatch 统一负责。

    const d = dayDate(plan?.startDate, day)
    return {
      day,
      rows: dayRows,
      distanceKm,
      gainM,
      hours: estimateHours(distanceKm, gainM),
      difficultyMax,
      isFirst,
      isLast,
      hasIsland,
      ...(transferGapKm !== undefined ? { transferGapKm } : {}),
      warnings,
      ...(d ? { dateISO: d.iso, dateLabel: d.label, weekday: d.weekday } : {}),
    }
  })
}

/**
 * 这一趟要住几晚 = **出发前一晚 + 每个「有徒步路线的天」当晚**（最后一天那晚也照样算）。
 *
 * ⚠️ 只有排了路线的天才算一晚：空天（只写备注的自由活动 / 交通 / 休整日）推不出落脚点，
 * 住宿卡和行程单上都不给建议 —— 算进去就成了「说要住 N 晚、单子上只印得出 N−1 晚住宿」。
 *
 * ⚠️ 按天视图的「需住宿 N 晚」、行程单头部、Markdown 行程单三处必须都走这个函数：
 * 各写一遍公式迟早会漂（历史上一处按「有路线的天」算、一处按「要印出来的天」算，
 * 于是写了个备注的空天就会让行程单比按天视图多一晚）。
 */
export function stayNights(days: DayPlan[]): number {
  const routeDays = days.filter((d) => d.rows.length > 0).length
  // 一趟徒步都没排 → 前夜也不成立（没有「次日从哪开走」），直接 0
  return routeDays > 0 ? routeDays + 1 : 0
}

function toGeo(p: TrackPoint | GeoPoint): GeoPoint {
  return { lng: p.lng, lat: p.lat }
}

/** 还没分天的行（day 为 undefined） */
export function unassignedRows(rows: PlanRow[]): PlanRow[] {
  return rows.filter((r) => r.item.day === undefined)
}

/* ------------------------------------------------------------------ *
 * 下面是对 `items` 的纯操作。全部返回**新数组**，不改动入参。
 * ------------------------------------------------------------------ */

/** 把某条路线挪到第 day 天（或回待安排）。住宿锁在「天」上，挪路线不动它 */
export function assignDayItems(items: PlanItem[], routeId: string, day: number | undefined): PlanItem[] {
  return items.map((i) => {
    if (i.routeId !== routeId) return i
    const next: PlanItem = { ...i }
    if (day === undefined) delete next.day
    else next.day = day
    return next
  })
}

/** 切换某条路线的行走方向（正穿 / 反穿）；返回新数组，不改动入参 */
export function setDirectionItems(items: PlanItem[], routeId: string, direction: RouteDirection): PlanItem[] {
  return items.map((i) => (i.routeId !== routeId ? i : { ...i, direction }))
}

/**
 * 同一天内上移/下移一格。
 *
 * 同一天的行在 `items` 数组里未必连续（先加 A 到 Day1，再加 B 到 Day2，
 * 又把 C 加到 Day1 —— 数组里是 A、B、C，但 Day1 的顺序是 A、C），
 * 所以找的是「前一个（后一个）**同天**的元素」再交换位置。
 */
export function moveInDayItems(items: PlanItem[], routeId: string, dir: -1 | 1): PlanItem[] {
  const day = items.find((i) => i.routeId === routeId)?.day
  if (day === undefined) return items
  const idxSameDay: number[] = []
  items.forEach((i, idx) => {
    if (i.day === day) idxSameDay.push(idx)
  })
  const pos = idxSameDay.findIndex((idx) => items[idx].routeId === routeId)
  const target = pos + dir
  if (pos < 0 || target < 0 || target >= idxSameDay.length) return items
  const a = idxSameDay[pos]
  const b = idxSameDay[target]
  const next = [...items]
  next[a] = items[b]
  next[b] = items[a]
  return next
}

/**
 * 删除第 day 天：这一天的路线回到「待安排」，后面的天整体前移一天（不留下空洞的天号）。
 */
export function removeDayItems(items: PlanItem[], day: number): PlanItem[] {
  return items.map((i) => {
    if (i.day === undefined) return i
    if (i.day === day) {
      const next: PlanItem = { ...i }
      delete next.day
      return next
    }
    return i.day > day ? { ...i, day: i.day - 1 } : i
  })
}

/**
 * 锁定 / 解锁某天的住宿。住宿存在 `plan.stays`（按天）而不是挂在某条路线上 ——
 *
 * 挂在 item 上时，写只能落在被挑中的那一条上、读却要遍历当天所有 item，
 * 两边挑中的未必是同一条：一旦当天又加进一条路线（items 数组里它排在更后面），
 * 改选和「取消锁定」就都写到新那条上，而界面仍读到旧那条 —— 点了完全没反应。
 * 按天存储让读写走同一个 entry，上面这一类错位从数据结构上就不复存在。
 *
 * @returns 新的 plan。解锁后 map 为空时不留空对象，整个字段删掉。
 */
export function setPlanStay(plan: Plan, day: number, stayId: string | undefined): Plan {
  const stays: Record<number, string> = { ...(plan.stays ?? {}) }
  if (stayId) stays[day] = stayId
  else delete stays[day]
  const next: Plan = { ...plan }
  if (Object.keys(stays).length) next.stays = stays
  else delete next.stays
  return next
}

/** 取出某天锁定的住宿 id */
export function stayIdOfDay(plan: Plan | undefined, day: number): string | undefined {
  return plan?.stays?.[day]
}

/**
 * 删掉第 day 天后，之后每天的住宿锁定跟着整体前移一天 ——
 * 路线是这样移的（`removeDayItems`），住宿不跟着移的话，第 3 天订的酒店会
 * 落到第 2 天头上。
 */
export function removeDayStays(
  stays: Record<number, string> | undefined,
  day: number,
): Record<number, string> | undefined {
  if (!stays) return undefined
  const next: Record<number, string> = {}
  for (const key of Object.keys(stays)) {
    const n = Number(key)
    if (n === day) continue
    // JSON 反序列化后 key 是字符串，用数字下标读会自己转回去
    next[n > day ? n - 1 : n] = stays[n]
  }
  return Object.keys(next).length ? next : undefined
}

