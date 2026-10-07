import { useState } from 'react'
import { useData } from '../store/DataContext'
import { useToast } from './Feedback'
import styles from './UpdateBanner.module.less'

/**
 * 数据更新提示条（全站，内容区顶部）。
 *
 * 站点数据（路线 / 住宿 / 看点）随代码打包，本机存的是副本。代码里的数据改了之后，
 * 两份会不一致 —— 这里按指纹（`src/lib/bundleVersion.ts`）检测到就弹黄条，
 * 用户点「立即更新」才把本机的那份整段换成系统最新的那份。
 *
 * 为什么**不自动更新**：换数据会动到路线本身，用户在行程篮里锁定过的住宿可能因为
 * 真源删除而失效。给个明确动作，比悄悄覆盖掉好。
 *
 * 「稍后」只是关掉本次访问；数据确实还是旧的，下次打开照样提示。
 */
export function UpdateBanner() {
  const { bundleOutdated, applyBundleUpdate } = useData()
  const toast = useToast()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!bundleOutdated || dismissed) return null

  return (
    <div className={`${styles['banner']}`} role="status" aria-live="polite">
      <span className={`${styles['text']}`}>
        站点数据有更新：路线、住宿与看点出了新版本，你本机这份还是旧的。
      </span>
      <button
        type="button"
        className={`${styles['update']}`}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          const res = applyBundleUpdate()
          toast(`已更新：${res.routes} 条路线、${res.hotels} 家住宿、${res.sights} 处看点`, 'success')
          setBusy(false)
        }}
      >
        {busy ? '更新中…' : '立即更新'}
      </button>
      <button
        type="button"
        className={`${styles['close']}`}
        aria-label="稍后再说"
        title="稍后再说"
        onClick={() => setDismissed(true)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
