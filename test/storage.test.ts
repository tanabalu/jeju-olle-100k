/**
 * `storage.ts` —— 本机数据与备份导入导出。
 *
 * 这里管的都是「数据在边界上的形状」：localStorage 里翻出来的旧值、用户手改过的备份 JSON。
 * 这些是不可信输入，一旦漏掉归一化，页面会在 `.length` / `.map` 上直接白屏。
 *
 * node 环境下没有 localStorage（`storage.ts` 只在函数内部访问它，顶层不碰），
 * 所以这里挂一个内存实现上去即可。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, importBackup, normalizePlan, normalizeRoute, store } from '../src/lib/storage'
import type { UiState } from '../src/lib/storage'
import type { AppSettings, Plan, Route } from '../src/types'
import { item, plan, route } from './fixtures'

/** 内存版 localStorage */
function installLocalStorage(): void {
  const data = new Map<string, string>()
  const fake = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  } as unknown as Storage
  Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true })
}

beforeEach(() => {
  installLocalStorage()
})

describe('normalizeRoute', () => {
  it('缺失的数组字段一律补成 []（这些字段缺一个就会白屏）', () => {
    const dirty = { id: 'r1', name: '缺字段的路线' } as unknown as Route
    const n = normalizeRoute(dirty)
    expect(n.tags).toEqual([])
    expect(n.points).toEqual([])
    expect(n.hotels).toEqual([])
    expect(n.sights).toEqual([])
    expect(n.album).toEqual([])
    expect(n.elevationProfile).toEqual([])
  })

  it('看点的 images 也要补 —— 详情页会直接 `.map(hotel.images)`', () => {
    const dirty = {
      id: 'r1',
      sights: [{ id: 's1', name: '没图的看点' }],
    } as unknown as Route
    expect(normalizeRoute(dirty).sights[0].images).toEqual([])
  })

  it('不足 2 个点的分段整段丢掉（单点没法画线）', () => {
    const r = route({
      id: 'r1',
      elevationSegments: [[[126.5, 33.3, 10]] as [number, number, number][]],
    })
    expect(normalizeRoute(r).elevationSegments).toBeUndefined()
  })

  it('正常的字段不被改写', () => {
    const r = route({ id: 'r1', name: '原样', tags: ['海岸'] })
    expect(normalizeRoute(r).name).toBe('原样')
    expect(normalizeRoute(r).tags).toEqual(['海岸'])
  })
})

describe('normalizePlan', () => {
  it('items 缺失时补 []（旧备份里可能压根没这个字段）', () => {
    expect(normalizePlan({ id: 'p1' } as unknown as Plan).items).toEqual([])
  })

  it('分天与住宿等可选字段缺省就是 undefined，不编造', () => {
    const n = normalizePlan({ id: 'p1', name: 'x', targetKm: 100, createdAt: 0, updatedAt: 0 } as unknown as Plan)
    expect(n.stays).toBeUndefined()
    expect(n.dayCount).toBeUndefined()
  })
})

describe('exportBackup / importBackup', () => {
  it('导出的备份能原样导入回来', () => {
    store.setRoutes([route({ id: 'A', name: '城山日出峰线' })])
    store.setPlans([plan({ id: 'p1', items: [item('A', 1)] })])
    const json = exportBackup()
    const parsed = JSON.parse(json) as { version: number; routes: unknown[]; plans: unknown[] }
    expect(parsed.version).toBe(2)
    expect(parsed.routes).toHaveLength(1)
    expect(parsed.plans).toHaveLength(1)

    installLocalStorage() // 清空后重新导入
    const res = importBackup(json, 'replace')
    expect(res.routes).toBe(1)
    expect(store.getRoutes()[0].name).toBe('城山日出峰线')
    expect(store.getPlans()[0].items).toHaveLength(1)
  })

  it('replace：用备份里的东西整体替换本机', () => {
    store.setRoutes([route({ id: 'OLD', name: '本机旧数据' })])
    const json = JSON.stringify({ version: 2, exportedAt: 0, routes: [route({ id: 'NEW' })], plans: [] })
    importBackup(json, 'replace')
    expect(store.getRoutes().map((r) => r.id)).toEqual(['NEW'])
  })

  it('merge：同 id 的被备份覆盖，本机独有的保留', () => {
    store.setRoutes([route({ id: 'A', name: '本机版' }), route({ id: 'KEEP', name: '本机独有' })])
    const json = JSON.stringify({
      version: 2,
      exportedAt: 0,
      routes: [route({ id: 'A', name: '备份版' })],
      plans: [],
    })
    importBackup(json, 'merge')
    const after = store.getRoutes()
    expect(after).toHaveLength(2)
    expect(after.find((r) => r.id === 'A')?.name).toBe('备份版')
    expect(after.find((r) => r.id === 'KEEP')?.name).toBe('本机独有')
  })

  it('缺 routes 数组的 JSON 直接报错，而不是静默导入成空', () => {
    expect(() => importBackup('{"version":2}', 'replace')).toThrow(/routes/)
    expect(() => importBackup('这不是 JSON', 'replace')).toThrow()
  })

  it('没有 id 的脏条目被丢掉', () => {
    const json = JSON.stringify({
      version: 2,
      exportedAt: 0,
      routes: [{ name: '没有 id' }, route({ id: 'OK' })],
      plans: [{ name: '也没有 id' }],
    })
    expect(importBackup(json, 'replace').routes).toBe(1)
    expect(store.getPlans()).toHaveLength(0)
  })

  it('导入的脏数据被归一化过再落库', () => {
    const json = JSON.stringify({
      version: 2,
      exportedAt: 0,
      routes: [{ id: 'DIRTY', name: '缺数组的路线' }],
      plans: [{ id: 'p1', name: '缺 items 的行程篮' }],
    })
    importBackup(json, 'replace')
    expect(store.getRoutes()[0].hotels).toEqual([])
    expect(store.getPlans()[0].items).toEqual([])
  })
})

describe('settings / ui 的兜底', () => {
  it('未知的底图样式回落到 standard（否则瓦片配置取空，地图整片空白）', () => {
    expect(store.getSettings().mapStyle).toBe('standard')
    store.setSettings({ mapStyle: 'terrain' })
    expect(store.getSettings().mapStyle).toBe('terrain')
    store.setSettings({ mapStyle: '已下线的旧值' } as unknown as AppSettings)
    expect(store.getSettings().mapStyle).toBe('standard')
  })

  it('UI 状态逐字段兜底：脏值不会漏进渲染', () => {
    store.setUi({
      prepOnlyTodo: 'yes',
      planHideDone: false,
      planMapStayMode: 'unknown',
      prepGroupsCollapsed: undefined,
      prepPresetsOpen: [],
      prepTutorialsOpen: [],
    } as unknown as UiState)
    const ui = store.getUi()
    expect(ui.prepOnlyTodo).toBe(false)
    expect(ui.planMapStayMode).toBe('all')
    expect(ui.prepGroupsCollapsed).toEqual([])
  })
})
