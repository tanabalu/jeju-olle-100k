/**
 * `stayMatch.ts` —— 「今晚住哪」「出发前一晚住哪」的推荐。
 *
 * 这一层的规则都是用时效性和口吻写的（什么时候用官方口径、什么时候降级、要不要改写区建议），
 * 测试的重点因此放在**建议的构成**上：来源是什么、锁定之后原有建议有没有被改写、
 * 候选列表有没有去重。
 */
import { describe, expect, it } from 'vitest'
import type { DayPlan } from '../src/lib/dayPlan'
import type { PlanRow } from '../src/lib/dayPlan'
import type { LinkedHotel } from '../src/lib/stayMatch'
import {
  STAY_SEARCH_KM,
  collectHotels,
  rankAllByStart,
  rankAllStays,
  suggestPrevNight,
  suggestStay,
} from '../src/lib/stayMatch'
import type { Route } from '../src/types'
import { JEJU, hotel, item, plan, route, islandRoute } from './fixtures'
import { setPlanStay } from '../src/lib/dayPlan'

function pRow(r: Route, km = 10): PlanRow {
  return { item: item(r.id, 1), route: r, km, gainM: null, done: false }
}

function dayOf(rows: PlanRow[], day = 1): DayPlan {
  return {
    day,
    rows,
    distanceKm: rows.reduce((s, r) => s + r.km, 0),
    gainM: null,
    hours: 4,
    difficultyMax: 2,
    isFirst: day === 1,
    isLast: true,
    hasIsland: false,
    warnings: [],
  }
}

/** 默认 route 的终点：126.5512 / 33.5096 */
const END: { lng: number; lat: number } = { lng: 126.5512, lat: 33.5096 }
const NEAR = hotel({ id: 'NEAR', name: '终点旁的住宿', lng: END.lng, lat: END.lat, rating: 4.5 })
const FAR = hotel({ id: 'FAR', name: '30km 外的住宿', lng: 126.8, lat: 33.3, rating: 3 })

const onlyNear: LinkedHotel[] = [{ hotel: NEAR, routeId: 'A', routeName: 'A' }]
const mixedHotels: LinkedHotel[] = [
  { hotel: FAR, routeId: 'B', routeName: 'B' },
  { hotel: NEAR, routeId: 'A', routeName: 'A' },
]

describe('collectHotels', () => {
  it('同一家被挂在多条路线上时只保留一条（去重靠 hotel.id）', () => {
    const shared = hotel({ id: 'SAME', name: '同镇两线都挂了这家' })
    const pools = collectHotels([
      route({ id: 'A', hotels: [shared, hotel({ id: 'A1' })] }),
      route({ id: 'B', hotels: [shared, hotel({ id: 'B1' })] }),
    ])
    expect(pools).toHaveLength(3)
    expect(pools.filter((l) => l.hotel.id === 'SAME')).toHaveLength(1)
    // 保留最先遇到的那条路线，卡片上的来源标注用的是它
    expect(pools.find((l) => l.hotel.id === 'SAME')?.routeId).toBe('A')
  })

  it('没有 id 的条目不进池（连去重都无从下手）', () => {
    const pools = collectHotels([route({ id: 'A', hotels: [hotel({ id: 'X' })] })])
    expect(pools).toHaveLength(1)
  })

  it('路线上没有 hotels 字段时不炸', () => {
    expect(collectHotels([{ ...route({ id: 'A' }), hotels: undefined as unknown as never[] }])).toEqual([])
  })
})

describe('suggestStay · 每天的住宿建议', () => {
  const last = route({ id: 'A' })

  it('这天没有任何路线 → null（不去凭空推荐一个地方）', () => {
    expect(suggestStay(dayOf([]), undefined, onlyNear, undefined)).toBeNull()
  })

  it('有官方口径时按官方口径给区域，source 标 lastRoute', () => {
    const withOfficial = route({ id: 'A', code: '01' }) // TRIP_PLANS['01'] 有 stayReturn
    const s = suggestStay(dayOf([pRow(withOfficial)]), undefined, mixedHotels, undefined)
    expect(s?.source).toBe('lastRoute')
    expect(s?.area).toBeTruthy()
  })

  it('官方原文里「—— ……」的解释不会被印成标题', () => {
    const withOfficial = route({ id: 'A', code: '01' })
    const s = suggestStay(dayOf([pRow(withOfficial)]), undefined, mixedHotels, undefined)
    // 原标题是 "성산（城山） 或济州市 —— 起点 시흥리（始兴里） 属旧左邑，…"
    expect(s?.area).not.toContain('——')
    expect(s?.area).toBe('성산（城山）')
  })

  it('没有官方口径时降级到终点所在地，source 标 fallback', () => {
    const noOfficial = route({ id: 'A', code: 'ZZ-99', region: '韩国 · 济州岛 · 西归浦' })
    const s = suggestStay(dayOf([pRow(noOfficial)]), undefined, mixedHotels, undefined)
    expect(s?.source).toBe('fallback')
    expect(s?.area).toBe('西归浦')
  })

  it('含离岛时优先提示船班风险', () => {
    const udo = islandRoute({ id: 'udo', code: '01-1', tags: ['牛岛'] })
    const s = suggestStay(dayOf([pRow(udo)]), undefined, mixedHotels, undefined)
    expect(s?.source).toBe('island')
    expect(s?.reason).toContain('船')
  })

  it('最后一天也要给建议 —— 走完当天当晚仍要落脚', () => {
    const s = suggestStay(dayOf([pRow(route({ id: 'A', code: '01' }))]), undefined, mixedHotels, undefined)
    expect(s).not.toBeNull()
  })

  it('卡片上的候选被限制在候选半径内（远的留给「查看全部」抽屉）', () => {
    const s = suggestStay(dayOf([pRow(last)]), undefined, mixedHotels, undefined)
    expect(s?.candidates.map((c) => c.hotel.id)).toEqual(['NEAR'])
  })
})

describe('suggestStay · 用户锁定了住宿', () => {
  const last = route({ id: 'A', code: '01', hotels: [NEAR, FAR] })
  const p = () => setPlanStay(plan({ id: 'p', items: [item('A', 1)] }), 1, 'FAR')

  it('锁定不改写区域建议 —— 官方口径那条仍是主体，锁定的那家另行标注', () => {
    const auto = suggestStay(dayOf([pRow(last)]), undefined, mixedHotels, undefined)
    const locked = suggestStay(dayOf([pRow(last)]), undefined, mixedHotels, p())
    expect(locked?.area).toBe(auto?.area)
    expect(locked?.reason).toBe(auto?.reason)
    expect(locked?.source).toBe(auto?.source)
    expect(locked?.lockedHotel?.id).toBe('FAR')
  })

  it('连区域都推不出来时，锁定的那家就是唯一能交代的「住哪」', () => {
    const noAdvice = route({ id: 'A', code: 'ZZ-99', region: '' }) // 既无官方口径也无 region
    const locked = suggestStay(dayOf([pRow(noAdvice)]), undefined, mixedHotels, p())
    expect(locked?.source).toBe('locked')
    expect(locked?.lockedHotel?.id).toBe('FAR')
  })
})

describe('suggestPrevNight · 出发前一晚', () => {
  const first = route({ id: 'A', code: '01' })

  it('第一天没有路线 → null', () => {
    expect(suggestPrevNight(dayOf([]), mixedHotels, undefined)).toBeNull()
  })

  it('按「离第一天出发点近」给建议，而不是离终点近', () => {
    // NEAR 就在 A 的出发点上（JEJU），FAR 在 30km 外
    const s = suggestPrevNight(dayOf([pRow(first)]), mixedHotels, undefined)
    expect(s?.source).toBe('official')
    expect(s?.area).toBeTruthy()
    expect(s?.candidates[0].hotel.id).not.toBe('FAR')
  })

  it('锁定不改写区域建议，只把那家挂在 lockedHotel 上', () => {
    const auto = suggestPrevNight(dayOf([pRow(first)]), mixedHotels, undefined)
    const locked = suggestPrevNight(dayOf([pRow(first)]), mixedHotels, 'FAR')
    expect(locked?.area).toBe(auto?.area)
    expect(locked?.reason).toBe(auto?.reason)
    expect(locked?.lockedHotel?.id).toBe('FAR')
  })
})

describe('全量候选集合（查看全部住宿抽屉）', () => {
  const last = route({ id: 'A' })

  it('不做半径截断：远近都列，超出的标 near=false 但不隐藏', () => {
    const all = rankAllStays(last, undefined, mixedHotels)
    expect(all).toHaveLength(2)
    expect(all.find((c) => c.hotel.id === 'FAR')?.near).toBe(false)
    expect(all.find((c) => c.hotel.id === 'NEAR')?.near).toBe(true)
  })

  it('近的排在前面（有车的人才需要往下翻）', () => {
    const all = rankAllStays(last, undefined, mixedHotels)
    expect(all[0].hotel.id).toBe('NEAR')
    expect(all[0].toEndKm).toBeLessThan(STAY_SEARCH_KM)
  })

  it('同一家只在列表里出现一次', () => {
    const dup = mixedHotels.concat([{ hotel: NEAR, routeId: 'C', routeName: 'C' }])
    const all = rankAllStays(last, undefined, dup)
    expect(all.filter((c) => c.hotel.id === 'NEAR')).toHaveLength(1)
  })

  it('分数接近时评分高的排前', () => {
    const a = hotel({ id: 'LOW', lng: JEJU.lng, lat: JEJU.lat, rating: 3 })
    const b = hotel({ id: 'HIGH', lng: JEJU.lng, lat: JEJU.lat, rating: 5 })
    const all = rankAllStays(last, undefined, [
      { hotel: a, routeId: 'A', routeName: 'A' },
      { hotel: b, routeId: 'A', routeName: 'A' },
    ])
    expect(all[0].hotel.id).toBe('HIGH')
  })

  it('前夜全量列表按离出发点排序', () => {
    const first = route({ id: 'A' })
    const all = rankAllByStart(first, mixedHotels)
    expect(all[0].hotel.id).toBe('NEAR')
    expect(all[0].toStartKm).toBeLessThan(STAY_SEARCH_KM)
  })

  it('路线没有可用坐标时返回空列表，不崩', () => {
    expect(rankAllStays(route({ id: 'X', points: [] }), undefined, mixedHotels)).toEqual([])
  })
})
