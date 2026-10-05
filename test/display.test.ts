/**
 * 展示层的小纯函数与「数据结构不变量」。
 *
 * 放两件事：
 * 1. 名字 / 口径类函数（住宿三语回退、官方耗时、路面、路线类型）—— 一行逻辑、到处在用，
 *    改错一处不会报错，只会安静地显示错的东西；
 * 2. 常量数据的不变量（id 不重复、引用到的教程真实存在）—— 这类错误不会让页面崩，
 *    而是让「勾选了 A 结果 B 也勾上了」「教程点开是空白」这种最难查的现象。
 */
import { describe, expect, it } from 'vitest'
import { uid } from '../src/lib/id'
import { OLLE_DURATIONS, formatDurationRange, officialDuration } from '../src/lib/olleDurations'
import { OLLE_SURFACES, olleSurface } from '../src/lib/olleSurfaces'
import { GUIDE_SECTIONS, PREP_GROUPS, PREP_PRESETS, PREP_TUTORIALS, normItemText, tutorialOf } from '../src/lib/prep'
import { ROUTE_KIND_LABEL, routeKindLabel } from '../src/lib/routeKind'
import { stayName, staySubName } from '../src/lib/stayName'
import type { Hotel } from '../src/types'
import { hotel } from './fixtures'

describe('stayName · 住宿显示名', () => {
  const h = (p: Partial<Hotel>): Hotel => hotel({ id: 'x', name: '제주민박', ...p })

  it('优先级：中文 > 英文 > 韩文原名', () => {
    expect(stayName(h({ nameZh: '济州民宿', nameEn: 'Jeju Guesthouse' }))).toBe('济州民宿')
    expect(stayName(h({ nameEn: 'Jeju Guesthouse' }))).toBe('Jeju Guesthouse')
    expect(stayName(h({}))).toBe('제주민박')
  })

  it('空字符串等同于没填，回退到下一档', () => {
    expect(stayName(h({ nameZh: '', nameEn: 'Jeju' }))).toBe('Jeju')
  })

  it('staySubName：主名不是韩文原名时补一行韩文，方便现场问路', () => {
    expect(staySubName(h({ nameZh: '济州民宿' }))).toBe('제주민박')
    expect(staySubName(h({ nameEn: 'Jeju Guesthouse' }))).toBe('제주민박')
    expect(staySubName(h({}))).toBe('') // 主名就是原名，不再重复一遍
  })
})

describe('官方耗时与路面', () => {
  it('按编号取官方耗时；没有编号或没录入返回 undefined', () => {
    expect(officialDuration('01')).toEqual({ minH: 4, maxH: 5, officialKm: 15.1 })
    expect(officialDuration(undefined)).toBeUndefined()
    expect(officialDuration('')).toBeUndefined()
    expect(officialDuration('ZZ-99')).toBeUndefined()
  })

  it('A/B 分叉线各自有官方值，且山线不比海线短', () => {
    const a = officialDuration('03-A')
    const b = officialDuration('03-B')
    expect(a && b).toBeTruthy()
    expect((a?.officialKm ?? 0)).toBeGreaterThan(b?.officialKm ?? 0)
  })

  it('耗时区间展示成「4~5h」', () => {
    expect(formatDurationRange({ minH: 4, maxH: 5 })).toBe('4~5h')
  })

  it('官方耗时表本身合法：下界不超过上界、里程为正', () => {
    for (const [code, d] of Object.entries(OLLE_DURATIONS)) {
      expect(d.minH, code).toBeGreaterThan(0)
      expect(d.maxH, code).toBeGreaterThanOrEqual(d.minH)
      expect(d.officialKm ?? 1, code).toBeGreaterThan(0)
    }
  })

  it('路面：有就给、没有就 undefined', () => {
    const [knownCode] = Object.keys(OLLE_SURFACES)
    expect(typeof olleSurface(knownCode)).toBe('string')
    expect(olleSurface(undefined)).toBeUndefined()
    expect(olleSurface('ZZ-99')).toBeUndefined()
  })
})

describe('routeKindLabel', () => {
  it('每种路线类型都有中文标签 —— 枚举加了新值却忘了补标签会返回 undefined', () => {
    for (const kind of Object.keys(ROUTE_KIND_LABEL)) {
      expect(routeKindLabel(kind as 'hike')).toBeTruthy()
    }
    expect(routeKindLabel('hike')).toBe('徒步')
  })
})

describe('行前清单的数据不变量', () => {
  it('分组 id 不重复（重了会让勾选状态跨组串联）', () => {
    const ids = PREP_GROUPS.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('清单条目 id 全局唯一', () => {
    const all = PREP_GROUPS.flatMap((g) => g.items.map((i) => i.id))
    expect(new Set(all).size).toBe(all.length)
  })

  it('备选清单（预设）的 id 与条目 id 都不重复', () => {
    const presets = PREP_PRESETS.map((p) => p.id)
    expect(new Set(presets).size).toBe(presets.length)

    const allIds = PREP_PRESETS.flatMap((p) => p.items.map((i) => i.id))
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('备选清单的条目不与默认清单撞 id —— 加入后会变成两条同 id 的勾选项', () => {
    const defaults = new Set(PREP_GROUPS.flatMap((g) => g.items.map((i) => i.id)))
    const dup = PREP_PRESETS.flatMap((p) => p.items.map((i) => i.id)).filter((id) => defaults.has(id))
    expect(dup).toEqual([])
  })

  it('每条条目都有非空文案', () => {
    const all = [...PREP_GROUPS.flatMap((g) => g.items), ...PREP_PRESETS.flatMap((p) => p.items)]
    for (const i of all) expect(i.text.trim(), i.id).not.toBe('')
  })

  it('速查卡片里引用到的教程 id 都真实存在（点开不会是空白）', () => {
    const missing = GUIDE_SECTIONS.flatMap((s) =>
      s.cards.flatMap((c) => (c.tutorials ?? []).filter((id) => !PREP_TUTORIALS[id])),
    )
    expect(missing).toEqual([])
  })

  it('速查分区 id 不重复', () => {
    const ids = GUIDE_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('tutorialOf / normItemText', () => {
  it('tutorialOf 取得到注册过的教程，没注册返回 undefined', () => {
    const [id] = Object.keys(PREP_TUTORIALS)
    if (id) expect(tutorialOf(id)).toBeDefined()
    expect(tutorialOf('不存在的条目')).toBeUndefined()
  })

  it('文案去重只看字符：空白与大小写不影响', () => {
    expect(normItemText('带 备用袜')).toBe(normItemText('带备用袜'))
    expect(normItemText('　ABC　')).toBe(normItemText('abc'))
  })
})

describe('uid', () => {
  it('带前缀，且同一前缀下不重复', () => {
    expect(uid('hotel')).toMatch(/^hotel_/)
    expect(uid('hotel')).not.toBe(uid('hotel')) // 同毫秒生成也要不同
  })
})
