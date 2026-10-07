/**
 * `staySource.ts` —— 住宿来源判定与路线住宿合并。
 *
 * 核心要锁住的一条：**真源里删掉的住宿，不能因为「当前 bundle 里没有」就被当成后台手填留下来**。
 * 2026-10-07 删掉 854 条抓取住宿后，行程篮推荐列表里它们还在，根因就是这个
 * （旧判定：`!bundleIds.has(id)` = 手填；被删的 id 恰好不在 bundle 里 → 全留下了）。
 */
import { describe, expect, it } from 'vitest'
import { isBundleStay, mergeStays } from '../src/lib/staySource'
import { hotel, route } from './fixtures'

const TOWNS = { 성산: [hotel({ id: 'osm_node_1', name: '포구민박' })] }
const ROUTE_TOWNS = { '01': ['성산'] }
const BUNDLE_IDS = new Set(['osm_node_1'])

describe('isBundleStay', () => {
  it('抓取 / 补录脚本的 id 都算 bundle 来源', () => {
    for (const id of ['osm_node_123', 'osm_way_9', 'tourapi_77', 'kakao_5', 'manual_jeju-tovice']) {
      expect(isBundleStay(id), id).toBe(true)
    }
  })

  it('后台手填的 hotel_ 不算 bundle 来源', () => {
    expect(isBundleStay('hotel_mabc12_x9k2')).toBe(false)
  })
})

describe('mergeStays', () => {
  it('真源里删掉的抓取住宿，不再留在路线上', () => {
    // bundle 里只剩 osm_node_1，本地还存着被删掉的 osm_node_999（老数据的残留）
    const r = route({ id: '01', hotels: [hotel({ id: 'osm_node_999', name: '已删掉的民宿' })] })
    const merged = mergeStays(r, TOWNS, ROUTE_TOWNS, BUNDLE_IDS)
    expect(merged.hotels.map((h) => h.id)).toEqual(['osm_node_1'])
  })

  it('后台手填的住宿不会被真源冲掉', () => {
    const r = route({ id: '01', hotels: [hotel({ id: 'hotel_mabc12_x9k2', name: '我自己加的' })] })
    const merged = mergeStays(r, TOWNS, ROUTE_TOWNS, BUNDLE_IDS)
    expect(merged.hotels.map((h) => h.id)).toEqual(['osm_node_1', 'hotel_mabc12_x9k2'])
  })

  it('bundle 里的住宿被改写时，用 bundle 的最新版（名字跟着变）', () => {
    const stale = hotel({ id: 'osm_node_1', name: '旧名字' })
    const r = route({ id: '01', hotels: [stale] })
    const merged = mergeStays(r, TOWNS, ROUTE_TOWNS, BUNDLE_IDS)
    expect(merged.hotels).toHaveLength(1)
    expect(merged.hotels[0].name).toBe('포구민박')
  })

  it('结果没变时返回原对象（不触发下游重算）', () => {
    const r = route({ id: '01', hotels: [TOWNS.성산[0]] })
    expect(mergeStays(r, TOWNS, ROUTE_TOWNS, BUNDLE_IDS)).toBe(r)
  })

  it('路线不在 routeTowns 里时，只保留手填的', () => {
    const r = route({ id: '99', hotels: [hotel({ id: 'osm_node_999' }), hotel({ id: 'hotel_mabc12_x9k2' })] })
    const merged = mergeStays(r, TOWNS, ROUTE_TOWNS, BUNDLE_IDS)
    expect(merged.hotels.map((h) => h.id)).toEqual(['hotel_mabc12_x9k2'])
  })
})
