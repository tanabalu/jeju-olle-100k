/**
 * `dayPlan.ts` —— 行程篮按天排期的全部纯逻辑。
 *
 * 这一层是页面行为的总源头：界面上「第几天走哪条」「这天会不会太重」「今晚住哪」
 * 全部由这里算出来，所以改动这里的每一次都必须配套跑一遍本文件。
 *
 * 断言的写法有意规避「把实现再抄一遍」：多数用例给的是**现象级的期望**
 * （起床时刻应该是几点、删掉第 1 天后第 3 天那晚的住宿应该落到第几天），
 * 而不是照着 `-(hours + 2.5)` 抄一遍公式 —— 后者除了防重构，防不住算错。
 */
import { describe, expect, it } from 'vitest'
import {
  DAY_KM_LIGHT,
  DAY_KM_LIMIT,
  assignDayItems,
  dayDate,
  dayDepartureH,
  dayIslandExtraH,
  dayWakeH,
  estimateHours,
  fmtClock,
  formatHours,
  islandExtraH,
  islandKey,
  islandZh,
  isIslandRoute,
  moveInDayItems,
  planDayNumbers,
  planDays,
  planRows,
  removeDayItems,
  removeDayStays,
  routeEnds,
  setDirectionItems,
  setPlanStay,
  stayIdOfDay,
  unassignedRows,
} from '../src/lib/dayPlan'
import type { PlanRow } from '../src/lib/dayPlan'
import type { GeoPoint, Route, RouteMetrics } from '../src/types'
import { islandRoute, item, plan, route } from './fixtures'

const NO_METRICS = new Map<string, RouteMetrics>()

function row(r: Route, day: number | undefined, km: number): PlanRow {
  return { item: item(r.id, day), route: r, km, gainM: null, done: false }
}

describe('planDayNumbers', () => {
  it('取「item 最大天号」与「显式 dayCount」的较大者', () => {
    expect(planDayNumbers(plan({ id: 'p', items: [item('A', 1), item('B', 3)] }))).toEqual([1, 2, 3])
    // 用户点了「加一天」但还没塞路线进去：这一天是存在的，只是暂时空着
    expect(planDayNumbers(plan({ id: 'p', items: [item('A', 1)], dayCount: 3 }))).toEqual([1, 2, 3])
  })

  it('空行程篮 / 全部待安排 → 没有天', () => {
    expect(planDayNumbers(undefined)).toEqual([])
    expect(planDayNumbers(plan({ id: 'p', items: [item('A')] }))).toEqual([])
  })
})

describe('dayDate', () => {
  /**
   * 防的是「面板上写 10/5、行程单上却写 10/4」：用 `toISOString()` 取日期会先转 UTC，
   * 在东八区整体倒退一天。所以断言的是**和输入的出发日完全一致**。
   */
  it('第 1 天的日期就是出发日，不会因时区错位', () => {
    const d = dayDate('2026-10-05', 1)
    expect(d?.iso).toBe('2026-10-05')
    expect(d?.label).toBe('10/5')
  })

  it('第 N 天 = 出发日 + N − 1，并给出星期', () => {
    const d = dayDate('2026-10-05', 3)
    expect(d?.iso).toBe('2026-10-07')
    expect(d?.weekday).toBe('周三') // 2026-10-07 是周三
  })

  it('没填出发日或格式不对 → undefined（没有就没有，不编一个出来）', () => {
    expect(dayDate(undefined, 1)).toBeUndefined()
    expect(dayDate('2026/10/05', 1)).toBeUndefined()
    expect(dayDate('乱码', 1)).toBeUndefined()
  })
})

describe('耗时与时辰', () => {
  it('平地 + 爬升相结合的估算：18km 平地约 5h，450m 爬升再加 1h', () => {
    expect(estimateHours(18, null)).toBeCloseTo(5, 6)
    expect(estimateHours(18, 450)).toBeCloseTo(6, 6)
  })

  it('爬升是 null / NaN 时不参与估算，也不让结果变成 NaN', () => {
    expect(estimateHours(10, null)).toBeCloseTo(10 / 3.6, 6)
    expect(estimateHours(10, Number.NaN)).toBeCloseTo(10 / 3.6, 6)
  })

  it('formatHours：不足 1 小时只写分钟；四舍五入到 60 分钟时正确进位', () => {
    expect(formatHours(0)).toBe('—')
    expect(formatHours(-1)).toBe('—')
    expect(formatHours(Number.NaN)).toBe('—')
    expect(formatHours(0.5)).toBe('30m')
    expect(formatHours(4.5)).toBe('4h30m')
    // 小数部分四舍五入到 60min 时正确进位，而不是输出成 "1h60m"
    expect(formatHours(1.9999)).toBe('2h00m')
  })

  it('一天一条线收工 16:00、两条及以上 17:00，起床时刻由收工倒推', () => {
    // 一条线、4h 步行：16:00 − 4h − 2.5h 缓冲 = 09:30 起床
    expect(fmtClock(dayWakeH(4, 1))).toBe('09:30')
    // 两条线、6h 步行：17:00 − 6h − 2.5h 缓冲 = 08:30 起床
    expect(fmtClock(dayWakeH(6, 2))).toBe('08:30')
  })

  it('出发时刻 = 起床 + 缓冲；当天走完正好落在收工时刻', () => {
    expect(dayDepartureH(4, 1)).toBeCloseTo(16 - 4, 6)
    expect(fmtClock(dayDepartureH(6, 2))).toBe('11:00')
  })

  it('fmtClock 按 24h 取模，跨午夜不炸', () => {
    expect(fmtClock(24.5)).toBe('00:30')
    expect(fmtClock(-0.25)).toBe('23:45')
  })
})

describe('离岛', () => {
  const udo = islandRoute({ id: 'udo', region: '济州市', tags: ['牛岛'] })
  const gapado = islandRoute({ id: 'gapado', tags: ['加波岛'] })
  const chuja = islandRoute({ id: 'chuja', tags: ['楮子岛'] })
  const inland = route({ id: '01' })

  it('判定来源有 tags 和 region 两个兜底（历史上这两处的写法并不统一）', () => {
    expect(isIslandRoute(udo)).toBe(true)
    expect(isIslandRoute(gapado)).toBe(true)
    expect(isIslandRoute(inland)).toBe(false)
  })

  it('识别出是哪个岛，并给出中文名', () => {
    expect(islandKey(udo)).toBe('udo')
    expect(islandZh(udo)).toBe('牛岛')
    expect(islandZh(gapado)).toBe('加波岛')
    expect(islandZh(chuja)).toBe('楮子岛')
  })

  it('额外时长 = 买票排队 + 坐船往返；非离岛为 0', () => {
    expect(islandExtraH(inland)).toBe(0)
    expect(islandExtraH(udo)).toBeCloseTo(0.5 + 0.5, 6) // 0.5 排队 + 0.5 往返
    expect(islandExtraH(chuja)).toBeCloseTo(0.5 + 2.5, 6) // 楮子岛船程最长
  })

  it('一天的离岛额外时长 = 当天各条之和', () => {
    expect(dayIslandExtraH([row(udo, 1, 5), row(inland, 1, 7)])).toBeCloseTo(1.0, 6)
    expect(dayIslandExtraH([row(inland, 1, 7)])).toBe(0)
  })
})

describe('routeEnds（含反穿）', () => {
  const r = route({
    id: 'R1',
    points: [
      { id: 'a', name: '起点', lng: 126.2, lat: 33.2, kind: 'start' },
      { id: 'b', name: '终点', lng: 126.5, lat: 33.4, kind: 'end' },
    ],
  })

  it('正穿：起点 = points[0]，终点 = 最后一个点', () => {
    expect(routeEnds(r).start?.name).toBe('起点')
    expect(routeEnds(r).end?.name).toBe('终点')
  })

  it('反穿把首尾对调 —— 出发变了，当晚住宿位置与次日出发点都会跟着变', () => {
    expect(routeEnds(r, undefined, 'reverse').start?.name).toBe('终点')
    expect(routeEnds(r, undefined, 'reverse').end?.name).toBe('起点')
  })

  it('官方 startPoint / endPoint 优先于轨迹端点', () => {
    const withOfficial = route({
      ...r,
      startPoint: { id: 'os', name: '官方起点', lng: 126.2, lat: 33.2, kind: 'start' },
      endPoint: { id: 'oe', name: '官方终点', lng: 126.5, lat: 33.4, kind: 'end' },
    })
    expect(routeEnds(withOfficial).start?.name).toBe('官方起点')
  })
})

describe('items 的纯操作', () => {
  it('assignDayItems：挪到第 N 天 / 挪回待安排', () => {
    const items = [item('A', 1), item('B', 2)]
    expect(assignDayItems(items, 'A', 3).find((i) => i.routeId === 'A')?.day).toBe(3)
    expect(assignDayItems(items, 'A', undefined).find((i) => i.routeId === 'A')?.day).toBeUndefined()
  })

  it('assignDayItems 不碰住宿 —— 住宿在 plan.stays 上，挪路线不该把它弄丢', () => {
    const moved = assignDayItems([item('A', 1), item('B', 1)], 'A', 2)
    expect(moved.every((i) => !('stayId' in i))).toBe(true)
  })

  it('moveInDayItems：同一天相邻的两条交换前后顺序', () => {
    const items = [item('A', 1), item('B', 1)]
    expect(moveInDayItems(items, 'A', 1).map((i) => i.routeId)).toEqual(['B', 'A'])
  })

  it('moveInDayItems：同一天但在数组里不相邻时也能正确交换', () => {
    // 数组是 A、B、C，其中 A / C 属于 Day1 —— 中间隔了属于 Day2 的 B
    const moved = moveInDayItems([item('A', 1), item('B', 2), item('C', 1)], 'C', -1)
    expect(moved.map((i) => i.routeId)).toEqual(['C', 'B', 'A'])
    expect(moved[1].routeId).toBe('B') // B 属于别的天，位置纹丝不动
  })

  it('moveInDayItems：已经在天头 / 天尾时不换，也不会串到别的天', () => {
    const items = [item('A', 1), item('B', 2)]
    expect(moveInDayItems(items, 'A', -1)).toEqual(items)
    expect(moveInDayItems(items, 'A', 1)).toEqual(items)
  })

  it('待安排的 item 不上移下移', () => {
    const items = [item('A'), item('B')]
    expect(moveInDayItems(items, 'A', 1)).toEqual(items)
  })

  it('removeDayItems：当天路线回待安排，后面的天整体前移', () => {
    const after = removeDayItems([item('A', 1), item('B', 2), item('C', 3)], 1)
    expect(after.find((i) => i.routeId === 'A')?.day).toBeUndefined()
    expect(after.find((i) => i.routeId === 'B')?.day).toBe(1)
    expect(after.find((i) => i.routeId === 'C')?.day).toBe(2)
  })

  it('setDirectionItems 只改命中那一条的方向', () => {
    const after = setDirectionItems([item('A', 1), item('B', 1)], 'B', 'reverse')
    expect(after.find((i) => i.routeId === 'B')?.direction).toBe('reverse')
    expect(after.find((i) => i.routeId === 'A')?.direction).toBeUndefined()
  })

  it('unassignedRows 挑出还没分天的行', () => {
    const rows = [row(route({ id: 'A' }), 1, 5), row(route({ id: 'B' }), undefined, 3)]
    expect(unassignedRows(rows).map((r) => r.route.id)).toEqual(['B'])
  })

  it('items 的操作全部返回新数组，不改动入参', () => {
    const items = [item('A', 1), item('B', 1)]
    const snapshot = JSON.stringify(items)
    assignDayItems(items, 'A', 2)
    moveInDayItems(items, 'B', -1)
    removeDayItems(items, 1)
    setDirectionItems(items, 'A', 'reverse')
    expect(JSON.stringify(items)).toBe(snapshot)
  })
})

describe('住宿锁定（plan.stays，按天存）', () => {
  /**
   * 这一组是重灾区。旧实现把住宿挂在某条 PlanItem 上，写找「当天数组里最后一条」、
   * 读找「当天第一条带 stayId 的」—— 一旦锁定之后又往这天加一条路线（数组里排在更后面），
   * 改选和「取消锁定」就都写到新那条上、界面仍读到旧那条，表现是点了完全没反应。
   * 改成按天存后读写走同一个 entry，下面每一条都是在锁死这个性质。
   */
  it('写进去就能读出来（读写走同一个位置）', () => {
    const p = setPlanStay(plan({ id: 'p', items: [item('A', 1)] }), 1, 'H1')
    expect(stayIdOfDay(p, 1)).toBe('H1')
  })

  it('锁定之后当天再加一条路线，改选仍然生效', () => {
    let p = setPlanStay(plan({ id: 'p', items: [item('A', 1), item('B', 1)] }), 1, 'H1')
    // addRoute 永远 append 到数组尾部 —— 这一步就是旧实现失效的触发条件
    p = { ...p, items: [...p.items, item('C', 1)] }
    expect(stayIdOfDay(p, 1)).toBe('H1')

    p = setPlanStay(p, 1, 'H2')
    expect(stayIdOfDay(p, 1)).toBe('H2')
  })

  it('取消锁定：读到空，且不留一个空 map', () => {
    let p = setPlanStay(plan({ id: 'p', items: [item('A', 1)] }), 1, 'H1')
    p = setPlanStay(p, 1, undefined)
    expect(stayIdOfDay(p, 1)).toBeUndefined()
    expect('stays' in p).toBe(false)
  })

  it('每天各自独立，互不影响', () => {
    let p = plan({ id: 'p', items: [item('A', 1), item('B', 2)] })
    p = setPlanStay(setPlanStay(p, 1, 'H1'), 2, 'H2')
    expect(stayIdOfDay(p, 1)).toBe('H1')
    expect(stayIdOfDay(p, 2)).toBe('H2')
  })

  it('JSON 往返后仍然对得上（Record 的 key 会被序列化成字符串）', () => {
    const p = setPlanStay(plan({ id: 'p', items: [item('A', 1), item('B', 2)] }), 2, 'H2')
    expect(stayIdOfDay(JSON.parse(JSON.stringify(p)), 2)).toBe('H2')
  })

  it('setPlanStay 不改动入参', () => {
    const before = setPlanStay(plan({ id: 'p', items: [item('A', 1)] }), 1, 'H1')
    const snapshot = JSON.stringify(before)
    setPlanStay(before, 1, 'H2')
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('removeDayStays：删掉第 N 天后，之后每天的住宿跟着整体前移', () => {
    const stays = { 1: 'H1', 2: 'H2', 3: 'H3' }
    expect(removeDayStays(stays, 1)).toEqual({ 1: 'H2', 2: 'H3' }) // 删头：全部前移
    expect(removeDayStays(stays, 2)).toEqual({ 1: 'H1', 2: 'H3' }) // 删中间：只有后面的移
    expect(removeDayStays(stays, 3)).toEqual({ 1: 'H1', 2: 'H2' }) // 删尾：前面的不动
  })

  it('removeDayStays：删空了就返回 undefined（不留空对象）', () => {
    expect(removeDayStays({ 1: 'H1' }, 1)).toBeUndefined()
    expect(removeDayStays(undefined, 1)).toBeUndefined()
  })

  it('删掉某天时 items 与 stays 同步前移 —— 原本当天订好的住宿跟得上天号', () => {
    let p = plan({ id: 'p', items: [item('A', 1), item('B', 2), item('C', 3)] })
    p = setPlanStay(setPlanStay(p, 2, 'H2'), 3, 'H3')
    const after = { ...p, items: removeDayItems(p.items, 1), stays: removeDayStays(p.stays, 1) }
    expect(stayIdOfDay(after, 1)).toBe('H2') // 原本第 2 天订的那家
    expect(stayIdOfDay(after, 2)).toBe('H3') // 原本第 3 天订的那家
  })
})

describe('planDays（按天聚合与告警）', () => {
  /** 默认 fixtures 下两条的首尾相距约 2.2km —— 天然构成「接不上」的断口 */
  const A = route({ id: 'A' })
  const B = route({ id: 'B' })
  const C = route({ id: 'C' })

  it('每天的里程 / 爬升是该天所有路线之和', () => {
    const p = plan({ id: 'p', items: [item('A', 1), item('B', 1)] })
    const days = planDays(p, [row(A, 1, 10), row(B, 1, 5)], NO_METRICS)
    expect(days).toHaveLength(1)
    expect(days[0].distanceKm).toBe(15)
    expect(days[0].rows).toHaveLength(2)
  })

  it('爬升全是 null 时保持 null —— 「没采集」不能显示成 0', () => {
    const p = plan({ id: 'p', items: [item('A', 1)] })
    expect(planDays(p, [row(A, 1, 10)], NO_METRICS)[0].gainM).toBeNull()
  })

  it('里程超过上限 → 提醒这天偏重', () => {
    const p = plan({ id: 'p', items: [item('A', 1)] })
    expect(planDays(p, [row(A, 1, DAY_KM_LIMIT + 1)], NO_METRICS)[0].warnings.map((w) => w.kind)).toContain(
      'overload',
    )
    expect(planDays(p, [row(A, 1, 10)], NO_METRICS)[0].warnings.map((w) => w.kind)).not.toContain('overload')
  })

  it('只有中间天过轻才催你加线，首尾天不催（首尾本来就有交通）', () => {
    const p = plan({ id: 'p', items: [item('A', 1), item('B', 2), item('C', 3)] })
    const days = planDays(
      p,
      [row(A, 1, DAY_KM_LIGHT - 1), row(B, 2, DAY_KM_LIGHT - 1), row(C, 3, DAY_KM_LIGHT - 1)],
      NO_METRICS,
    )
    expect(days[1].warnings.map((w) => w.kind)).toContain('light')
    expect(days[0].isFirst).toBe(true)
    expect(days[0].warnings.map((w) => w.kind)).not.toContain('light')
    expect(days[2].isLast).toBe(true)
    expect(days[2].warnings.map((w) => w.kind)).not.toContain('light')
  })

  it('dayCount 撑出来的空天照样出现在结果里', () => {
    const p = plan({ id: 'p', items: [item('A', 1)], dayCount: 2 })
    const days = planDays(p, [row(A, 1, 10)], NO_METRICS)
    expect(days).toHaveLength(2)
    expect(days[1].rows).toHaveLength(0)
    expect(days[1].distanceKm).toBe(0)
  })

  it('昨天终点接不上今天起点 → 提示要坐车接驳', () => {
    const p = plan({ id: 'p', items: [item('A', 1), item('B', 2)] })
    const day2 = planDays(p, [row(A, 1, 10), row(B, 2, 10)], NO_METRICS)[1]
    expect(day2.transferGapKm).toBeGreaterThan(1)
    expect(day2.warnings.map((w) => w.kind)).toContain('gap')
  })

  it('选了住宿后改从住宿点算接驳 —— 订得对就不用坐车，告警消失', () => {
    const p = setPlanStay(plan({ id: 'p', items: [item('A', 1), item('B', 2)] }), 1, 'NEAR')
    const sleepAt: GeoPoint = { lng: 126.5312, lat: 33.4996 } // 正好是 B 的出发点
    const day2 = planDays(p, [row(A, 1, 10), row(B, 2, 10)], NO_METRICS, new Map([[1, sleepAt]]))[1]
    expect(day2.warnings.map((w) => w.kind)).not.toContain('gap')
  })

  it('含离岛路线 → 提示确认船班', () => {
    const udo = islandRoute({ id: 'udo', tags: ['牛岛'] })
    const days = planDays(plan({ id: 'p', items: [item('udo', 1)] }), [row(udo, 1, 5)], NO_METRICS)
    expect(days[0].hasIsland).toBe(true)
    expect(days[0].warnings.map((w) => w.kind)).toContain('island')
  })

  it('填了出发日才有日期标签', () => {
    const p = plan({ id: 'p', items: [item('A', 1)], startDate: '2026-10-05' })
    expect(planDays(p, [row(A, 1, 10)], NO_METRICS)[0].dateISO).toBe('2026-10-05')
  })
})

describe('planRows', () => {
  it('找不到对应 Route 的行会被丢掉（脏数据不能让整页崩掉）', () => {
    const p = plan({ id: 'p', items: [item('A', 1), item('GHOST', 1)] })
    const metrics = new Map<string, RouteMetrics>([
      ['A', { straightKm: 0, distanceKm: 12, gainM: 100, lossM: 90 }],
    ])
    const rows = planRows(p, [route({ id: 'A' })], metrics)
    expect(rows.map((r) => r.route.id)).toEqual(['A'])
    expect(rows[0].km).toBe(12)
    expect(rows[0].gainM).toBe(100)
  })

  it('行程篮不存在 → 没有行', () => {
    expect(planRows(undefined, [], NO_METRICS)).toEqual([])
  })
})
