/**
 * `geo.ts` —— 距离、爬升、画线几何。
 *
 * 这里的历史坑最多，下面每一条都对应一次真实修过的 bug：
 * - haversine 少乘 2（所有距离只剩一半）；
 * - 有断口的轨迹把几段串起来算，把断口处那根根本不存在的直线算进里程；
 * - `mapLines` 只收有轨迹的路线，导致没轨迹的路线从图上整条消失。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WINDING_FACTOR,
  ELEV_NOISE_M,
  computeMetrics,
  cumulativeKm,
  elevationProfile,
  formatGain,
  formatKm,
  haversineKm,
  mapLines,
  mapLineSet,
  pathLengthKm,
  projectToRoute,
  routeBadgeAnchor,
  trackLines,
  trackSegs,
} from '../src/lib/geo'
import type { GeoPoint } from '../src/types'
import { JEJU, pt, route } from './fixtures'

/** 带海拔的点，方便写爬升用例 */
function ele(lng: number, lat: number, e: number): GeoPoint {
  return { lng, lat, ele: e }
}

describe('haversineKm', () => {
  it('纬度差 1° ≈ 111.2 km', () => {
    const km = haversineKm({ lng: 126.5, lat: 33 }, { lng: 126.5, lat: 34 })
    // 少乘 2 的实现会得到约 55.6 km —— 这个区间能抓到那次事故
    expect(km).toBeGreaterThan(110)
    expect(km).toBeLessThan(112.5)
  })

  it('经度在高纬处更短：同样 1° 在北纬 33° 约 93 km', () => {
    const km = haversineKm({ lng: 126, lat: 33 }, { lng: 127, lat: 33 })
    expect(km).toBeGreaterThan(92.5)
    expect(km).toBeLessThan(94)
  })

  it('对称、且自己到自己为 0', () => {
    const a: GeoPoint = { lng: 126.2, lat: 33.3 }
    const b: GeoPoint = { lng: 126.6, lat: 33.5 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 12)
    expect(haversineKm(a, a)).toBeCloseTo(0, 12)
  })

  it('跨半个子午面的长距离不会崩（不会超过地球半周长）', () => {
    const km = haversineKm({ lng: -179, lat: 0 }, { lng: 179, lat: 0 })
    expect(km).toBeGreaterThan(0)
    expect(km).toBeLessThan(20_100) // 地球半周长 ≈ 20015 km
  })
})

describe('pathLengthKm / cumulativeKm', () => {
  it('折线长 = 各段之和，累计里程首点为 0', () => {
    const pts: GeoPoint[] = [
      { lng: 126.0, lat: 33.0 },
      { lng: 126.0, lat: 33.5 },
      { lng: 126.0, lat: 34.0 },
    ]
    const seg = haversineKm(pts[0], pts[1])
    expect(pathLengthKm(pts)).toBeCloseTo(seg * 2, 6)

    const cum = cumulativeKm(pts)
    expect(cum).toHaveLength(3)
    expect(cum[0]).toBe(0)
    expect(cum[2]).toBeCloseTo(pathLengthKm(pts), 6)
  })

  it('空 / 单点 → 0', () => {
    expect(pathLengthKm([])).toBe(0)
    expect(pathLengthKm([JEJU])).toBe(0)
    expect(cumulativeKm([JEJU])).toEqual([0])
  })
})

describe('elevationProfile', () => {
  it('单调爬升：落差累加', () => {
    expect(elevationProfile([ele(0, 0, 0), ele(0, 1, 10), ele(0, 2, 20)])).toEqual({ gainM: 20, lossM: 0 })
  })

  it('单调下降：只计下降', () => {
    expect(elevationProfile([ele(0, 0, 100), ele(0, 1, 90), ele(0, 2, 80)])).toEqual({ gainM: 0, lossM: 20 })
  })

  it('上下起伏分别累计', () => {
    expect(elevationProfile([ele(0, 0, 0), ele(0, 1, 50), ele(0, 2, 10), ele(0, 3, 60)])).toEqual({
      gainM: 100,
      lossM: 40,
    })
  })

  it(`${ELEV_NOISE_M}m 以内的抖动不计入 —— 否则 GPS/SRTM 噪声会把爬升抬得离谱`, () => {
    // 每步只抖 2m：参照点不更新，累计起来跨过阈值才算一次
    const profile = elevationProfile([
      ele(0, 0, 0),
      ele(0, 1, 2),
      ele(0, 2, 4),
      ele(0, 3, 6),
      ele(0, 4, 8),
    ])
    expect(profile?.gainM).toBe(8)
    expect(profile?.lossM).toBe(0)
  })

  it('没有海拔数据的点不参与计算（undefined 不能当成 0）', () => {
    const pts: GeoPoint[] = [{ lng: 0, lat: 0, ele: 0 }, { lng: 0, lat: 1 }, { lng: 0, lat: 2, ele: 20 }]
    expect(elevationProfile(pts)).toEqual({ gainM: 20, lossM: 0 })
  })

  it('有效高程点不足 2 个 → null（「没采集」不能被显示成「爬升 0 m」）', () => {
    expect(elevationProfile([])).toBeNull()
    expect(elevationProfile([JEJU])).toBeNull()
    expect(elevationProfile([JEJU, JEJU])).toBeNull()
  })
})

describe('projectToRoute', () => {
  it('POI 投影到单条线段上时给出沿线里程', () => {
    const line = [
      { lng: 126.0, lat: 33.0 },
      { lng: 126.1, lat: 33.0 },
      { lng: 126.2, lat: 33.0 },
    ]
    const mid: GeoPoint = { lng: 126.1, lat: 33.0 }
    const r = projectToRoute(mid, line.map(toTrack))
    expect(r.offRouteKm).toBeCloseTo(0, 3)
    expect(r.atKm).toBeGreaterThan(0)
  })

  it('空 / 单点轨迹不会崩', () => {
    expect(projectToRoute(JEJU, [])).toEqual({ atKm: 0, offRouteKm: 0 })
    expect(projectToRoute(JEJU, [toTrack(JEJU)]).atKm).toBe(0)
  })
})

function toTrack(p: GeoPoint) {
  return { ...p, id: `${p.lng},${p.lat}`, name: `${p.lng},${p.lat}`, kind: 'via' as const }
}

describe('computeMetrics', () => {
  const straightRoute = route({
    id: 'R',
    points: [pt('a', '起点', 126.5, 33), pt('b', '终点', 126.5, 34)],
  })

  it('没有轨迹数据时：里程 = 途经点直线 × 绕行系数', () => {
    const m = computeMetrics(straightRoute)
    expect(m.distanceKm).toBeCloseTo(m.straightKm * DEFAULT_WINDING_FACTOR, 6)
    expect(m.gainM).toBeNull() // 没有高程 → null，不是 0
    expect(m.gainSource).toBe('none')
  })

  it('手填里程优先于任何推算值', () => {
    const m = computeMetrics(route({ ...straightRoute, manualDistanceKm: 15.6 }))
    expect(m.distanceKm).toBe(15.6)
  })

  it('手填里程只对正数生效（0 / 负数不能把里程抹成 0）', () => {
    expect(computeMetrics(route({ ...straightRoute, manualDistanceKm: 0 })).distanceKm).toBeGreaterThan(0)
    expect(computeMetrics(route({ ...straightRoute, manualDistanceKm: -1 })).distanceKm).toBeGreaterThan(0)
  })

  it('手填爬升优先，并标记来源为 manual', () => {
    const m = computeMetrics(route({ ...straightRoute, manualGainM: 320 }))
    expect(m.gainM).toBe(320)
    expect(m.gainSource).toBe('manual')
  })

  it('有真实轨迹时里程取轨迹长度，不再乘绕行系数', () => {
    const tracked = route({
      ...straightRoute,
      elevationBasis: 'track',
      elevationProfile: [
        [126.5, 33, 10],
        [126.5, 33.5, 60],
        [126.5, 34, 20],
      ],
    })
    const m = computeMetrics(tracked)
    expect(m.trackKm).toBeGreaterThan(0)
    expect(m.distanceKm).toBeCloseTo(m.trackKm ?? 0, 6)
    expect(m.gainM).toBe(50) // 0 → 60 爬 50，60 → 20 降 40
    expect(m.highestM).toBe(60)
    expect(m.lowestM).toBe(10)
  })

  it('有断口时逐段算，不把断口那根假直线算进里程', () => {
    const seg1 = [
      [126.0, 33.0, 0],
      [126.0, 33.5, 100],
    ] as [number, number, number][]
    const seg2 = [
      [126.9, 33.0, 0],
      [126.9, 33.5, 100],
    ] as [number, number, number][]
    const withGap = route({
      id: 'GAP',
      elevationBasis: 'track',
      elevationSegments: [seg1, seg2],
    })
    const m = computeMetrics(withGap)
    // 两段各自的里程之和；若把整串连起来算，会多出一根横跨全岛的直线
    const half = haversineKm({ lng: 126.0, lat: 33.0 }, { lng: 126.0, lat: 33.5 })
    expect(m.trackKm).toBeCloseTo(half * 2, 1)
    expect(m.trackKm).toBeLessThan(150) // 横跨全岛的直线约 90km，加起来会明显超出
    expect(m.gainM).toBe(200) // 两段各爬 100m
  })
})

describe('trackSegs / trackLines', () => {
  it('没有 elevationSegments 时整条 profile 算一段', () => {
    const r = route({
      id: 'S',
      elevationProfile: [
        [126.5, 33, 0],
        [126.5, 33.5, 100],
      ],
    })
    expect(trackSegs(r)).toHaveLength(1)
  })

  it('脏段（不足 2 个点）被丢掉，不会用单点去画线', () => {
    const r = route({
      id: 'D',
      elevationSegments: [[[126.5, 33, 0]] as [number, number, number][]],
      elevationProfile: [
        [126.5, 33, 0],
        [126.5, 33.5, 100],
      ],
    })
    // 脏段被丢后回退到整条 profile（1 段），而不是返回那个单点段
    expect(trackSegs(r)).toHaveLength(1)
    expect(trackSegs(r)[0]).toHaveLength(2)
  })

  it('trackLines 只对有真实轨迹（basis=track）的路线返回几何', () => {
    const tracked = route({
      id: 'T',
      elevationBasis: 'track',
      elevationProfile: [
        [126.5, 33, 0],
        [126.5, 33.5, 1],
      ],
    })
    expect(trackLines(tracked)).toBeDefined()
    expect(trackLines(route({ id: 'N' }))).toBeUndefined()
  })
})

describe('mapLineSet / mapLines（多条路线合到一张图）', () => {
  /**
   * 关键口径：每条路线至少贡献一段。RouteMap 的 `lines` 是一口气接管画线的，
   * 一旦非空就整体生效 —— 只把有轨迹的路线塞进去，没轨迹的会整条从图上消失。
   */
  it('没轨迹的路线也要出现，并标成示意线', () => {
    const lines = mapLineSet([route({ id: 'NO_TRACK' })])
    expect(lines).toHaveLength(1)
    expect(lines[0].approx).toBe(true)
  })

  it('有轨迹的路线标成实测，可能给出多段', () => {
    const tracked = route({
      id: 'T',
      elevationBasis: 'track',
      elevationSegments: [
        [
          [126.0, 33.0, 0],
          [126.0, 33.5, 1],
        ],
        [
          [126.9, 33.0, 0],
          [126.9, 33.5, 1],
        ],
      ] as [number, number, number][][],
    })
    const lines = mapLineSet([tracked])
    expect(lines).toHaveLength(2)
    expect(lines.every((l) => l.approx === false)).toBe(true)
  })

  it('一条路线都没有点时不贡献任何线', () => {
    expect(mapLineSet([route({ id: 'EMPTY', points: [] })])).toEqual([])
  })

  it('mapLines 与 mapLineSet 同顺序、同几何', () => {
    const rs = [route({ id: 'A' }), route({ id: 'B' })]
    const set = mapLineSet(rs)
    expect(mapLines(rs)).toEqual(set.map((l) => l.seg))
  })
})

describe('routeBadgeAnchor', () => {
  it('徽标落在线的里程中点，而不是起点或终点', () => {
    const r = route({
      id: 'M',
      points: [
        pt('a', '起点', 126.0, 33.0),
        pt('b', '第二条', 126.0, 33.3),
        pt('c', '第三条', 126.0, 33.6),
        pt('d', '终点', 126.0, 34.0),
      ],
    })
    const anchor = routeBadgeAnchor(r)
    expect(anchor?.lng).toBeCloseTo(126.0, 6)
    // 相邻路线常共享端点（1 号线终点 = 2 号线起点），徽标标在起点必然叠成一坨
    expect(anchor?.lat).toBeCloseTo(33.6, 6)
  })

  it('没有可用坐标 → null', () => {
    expect(routeBadgeAnchor(route({ id: 'X', points: [] }))).toBeNull()
  })
})

describe('展示格式化', () => {
  it('formatGain：没有数据时显示「—」，不冒充 0', () => {
    expect(formatGain(null)).toBe('—')
    expect(formatGain(undefined)).toBe('—')
    expect(formatGain(Number.NaN)).toBe('—')
    expect(formatGain(0)).toBe('0 m')
    expect(formatGain(123.6)).toBe('124 m')
  })

  it('formatKm：小于 10 保留 2 位，否则 1 位；非法值给「—」', () => {
    expect(formatKm(3.14159)).toBe('3.14')
    expect(formatKm(12.345)).toBe('12.3')
    expect(formatKm(Number.NaN)).toBe('—')
  })
})
