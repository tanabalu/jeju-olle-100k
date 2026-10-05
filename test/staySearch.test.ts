/**
 * `staySearch.ts` —— 住宿名称检索。
 *
 * 用户明确要求过「所有检索一律不区分大小写」，而实现上大小写只在 `fold()` 里归零一次 ——
 * 任何新加的匹配字段必须塞进 `haystack` 数组，不能在外面另写 `indexOf`/`includes`，
 * 否则会绕过这一层退化成大小写敏感。下面用一批大小写变体把这条性质锁住。
 */
import { describe, expect, it } from 'vitest'
import { matchStayName } from '../src/lib/staySearch'
import { hotel } from './fixtures'

/** 一家四个名字都齐的住宿：韩文原名 + 中文 + 英文 + 罗马音 */
const FULL = hotel({
  id: 'full',
  name: '제주 펜션',
  nameRomaja: 'jeju pensyeon',
  nameZh: '济州家庭旅馆',
  nameEn: 'Jeju Pension',
})

const RAMADA = hotel({ id: 'ramada', name: '라마다 플라자 제주 호텔', nameEn: 'Ramada Plaza Jeju Hotel' })

describe('matchStayName · 大小写', () => {
  it('大写 / 小写 / 混写命中完全相同', () => {
    for (const q of ['RAMADA', 'Ramada', 'ramada', 'RaMaDa']) {
      expect(matchStayName(RAMADA, q), `查询 ${q}`).toBe(true)
    }
  })

  it('多个词时每个词分别大小写归一', () => {
    expect(matchStayName(RAMADA, 'Ramada PLAZA')).toBe(true)
    expect(matchStayName(RAMADA, 'RAMADA plaza jeju')).toBe(true)
  })

  it('韩文没有大小写概念，这一层对韩文无副作用', () => {
    expect(matchStayName(FULL, '제주')).toBe(true)
    expect(matchStayName(FULL, '펜션')).toBe(true)
  })

  it('中文同样不受影响', () => {
    expect(matchStayName(FULL, '济州')).toBe(true)
    expect(matchStayName(FULL, '济州家庭旅馆')).toBe(true)
  })
})

describe('matchStayName · 分隔符', () => {
  it('忽略空格与连字符：连写能命中带空格的名字', () => {
    expect(matchStayName(RAMADA, 'RamadaPlaza')).toBe(true)
    expect(matchStayName(RAMADA, 'ramada-plaza')).toBe(true)
  })

  it('查询里带全角空格也能拆词', () => {
    expect(matchStayName(RAMADA, 'jeju　ramada')).toBe(true)
  })
})

describe('matchStayName · 多词与且关系', () => {
  const HYATT = hotel({ id: 'hyatt', name: '그랜드 하얏트 제주', nameEn: 'Grand Hyatt Jeju' })

  it('多个词是「且」关系，不要求顺序', () => {
    expect(matchStayName(HYATT, 'jeju hyatt')).toBe(true)
    expect(matchStayName(HYATT, 'hyatt jeju')).toBe(true)
  })

  it('缺一个词就不命中', () => {
    expect(matchStayName(HYATT, 'jeju')).toBe(true)
    expect(matchStayName(HYATT, 'jeju hospital')).toBe(false)
  })
})

describe('matchStayName · 罗马音与英文惯用拼写', () => {
  /**
   * OSM 给的多是韩式罗马音（펜션 → pensyeon），而用户订房时搜的是 `pension`。
   * 全岛 774 家里有 125 家写着 pensyeon —— 没有这层归一等于搜一家都搜不到。
   */
  it('搜英文惯用拼写能命中罗马音名字', () => {
    expect(matchStayName(FULL, 'pension')).toBe(true)
  })

  it('归一串是追加而不是替换：搜原来的罗马音也照样命中', () => {
    expect(matchStayName(FULL, 'pensyeon')).toBe(true)
  })

  it('其它业态的同词异写也是两边都通', () => {
    // [韩文原名, OSM 里的韩式罗马音, 用户输入惯用的英文拼写]
    const cases: [string, string, string][] = [
      ['리조트 라온', 'rijoteu raon', 'resort'],
      ['라온 콘도', 'kondo raon', 'condo'],
      ['게스트하우스 나래', 'geseuteuhauseu nulae', 'guesthouse'],
      ['호스텔 바다', 'hoseutel bada', 'hostel'],
      ['여관 바다', 'yeogwan bada', 'inn'],
    ]
    for (const [name, romaja, en] of cases) {
      const h = hotel({ id: `h-${en}`, name, nameRomaja: romaja })
      expect(matchStayName(h, en), `${romaja} 应命中 ${en}`).toBe(true)
      expect(matchStayName(h, romaja.split(' ')[0]), `${en} 查询下罗马音仍应命中`).toBe(true)
    }
  })
})

describe('matchStayName · 边界', () => {
  it('空关键词一律算命中（由调用方决定要不要过滤）', () => {
    expect(matchStayName(FULL, '')).toBe(true)
    expect(matchStayName(FULL, '   ')).toBe(true)
  })

  it('没写名字的字段不会让匹配崩掉', () => {
    const bare = hotel({ id: 'bare', name: '민박' })
    expect(matchStayName(bare, '민박')).toBe(true)
    expect(matchStayName(bare, 'jeju')).toBe(false)
  })

  it('前后多余空格不影响', () => {
    expect(matchStayName(RAMADA, '  ramada  ')).toBe(true)
  })
})
