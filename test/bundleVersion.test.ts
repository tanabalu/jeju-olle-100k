/**
 * `bundleVersion.ts` —— 打包数据的版本指纹。
 *
 * 这条要锁死的是「指纹只由内容决定」：一旦把时间戳之类每次运行都变的值算进去，
 * 用户每次刷新都会看到「数据有更新」的黄条，那就成了噪音。
 */
import { describe, expect, it } from 'vitest'
import { bundleFingerprint } from '../src/lib/bundleVersion'

describe('bundleFingerprint', () => {
  it('同一份数据连算两次结果一致（没把时间戳算进去）', () => {
    expect(bundleFingerprint()).toBe(bundleFingerprint())
  })

  it('是个非空十六进制串', () => {
    const fp = bundleFingerprint()
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('算一次在可接受耗时内（每次开页面都要跑）', () => {
    const t0 = Date.now()
    bundleFingerprint()
    // 全量序列化 29 条路线 + 住宿 + 看点，本机实测几十毫秒；
    // 给到 1s 是留足慢机器余量，超过就说明该缩小 payload 了
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})
