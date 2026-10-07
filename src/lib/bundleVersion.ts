/**
 * 打包数据的**版本指纹**。
 *
 * 站点数据（路线 / 住宿 / 看点）随代码一起打包，用户本机 localStorage 里存的是首次打开时
 * seed 出来的副本。代码改了数据、用户不清缓存的话，本机那份永远是旧的 —— 于是「真源删掉
 * 的条目在页面上还在」这类问题会一直复现。
 *
 * 解决办法不是让用户手动点按钮，而是**给数据算指纹**：
 * - 指纹从数据内容算出来，改了数据重新构建，指纹自然就变（不需要人工维护版本号）；
 * - 本机记下「上次同步时的指纹」，两者不一致就说明数据升级了，页面顶部弹黄条提示。
 *
 * ⚠️ 指纹必须**只由内容决定**，任何每次运行都变的值（时间戳、随机数）都不能进 payload，
 *    否则每次刷新都会误报「有更新」。`buildSeedRoutes()` 里每条路线都带 `createdAt` /
 *    `updatedAt`，所以这里显式把它们剔掉。
 */
import type { Route, TrackPoint } from '../types'
import { buildSeedRoutes } from './seed'
import { SEED_STAYS } from './seedStays'
import { DEFAULT_SIGHTS } from './sightsData'

/** FNV-1a 32 位。够快、无依赖；指纹只用来判「变没变」，不需要密码学强度。 */
function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    // Math.imul 保证 32 位乘法不溢出成浮点（JS 的 * 在大数上会丢精度）
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * 抹掉途经点 / 起终点上的 `id`。
 *
 * ⚠️ 这些点是 `seed.ts` 里 `tp()` / `viaFromDef()` 现造的，id 走 `uid()`（带时间戳 + 随机），
 *    **每次调用都不同**。不抹掉的话指纹每次刷新都在变，黄条会一直弹。
 *    坐标、名称、类型、海拔才是内容，全留着。
 */
function pointContent(p: TrackPoint | undefined): TrackPoint | undefined {
  if (!p) return p
  const { id: _id, ...rest } = p
  return { ...rest, id: '' }
}

/**
 * 剔掉「每次运行都不同」的字段，只留内容。
 *
 * `album` / `cover` 也一并剔掉：那是用户在本机攒的内容（自己上传的照片），
 * 不属于「系统数据」，不该参与系统数据的版本判定。
 */
function contentFields(route: Route): Omit<Route, 'createdAt' | 'updatedAt' | 'album' | 'cover'> {
  const { createdAt: _createdAt, updatedAt: _updatedAt, album: _album, cover: _cover, ...rest } = route
  return {
    ...rest,
    points: rest.points.map(pointContent) as TrackPoint[],
    startPoint: pointContent(rest.startPoint),
    endPoint: pointContent(rest.endPoint),
  }
}

/**
 * 当前代码里这份打包数据的指纹（16 位十六进制）。
 *
 * 覆盖范围 = 用户点「更新」时会被覆盖的三样：路线列表、住宿列表、看点列表。
 * 两个不同 seed 的 FNV-1a 拼起来，碰撞概率远低于单次 32 位。
 */
export function bundleFingerprint(): string {
  const payload = JSON.stringify({
    routes: buildSeedRoutes().map(contentFields),
    stays: SEED_STAYS,
    sights: DEFAULT_SIGHTS,
  })
  return fnv1a(payload, 0x811c9dc5) + fnv1a(payload, 0x9e3779b9)
}
