import { defineConfig } from 'vitest/config'

/**
 * 单测配置（纯逻辑层，不涉及 DOM）。
 *
 * 为什么单独一个文件而不是塞进 `vite.config.ts`：那边挂着 `@vitejs/plugin-react` 和
 * 一堆打包用的 manualChunks，测试根本用不到，混在一起只会让两边都难读。
 * vitest 会优先读本文件。
 *
 * 只用 node 环境（不装 jsdom）：被测对象刻意限制在 `src/lib` 的纯函数和组件里
 * 导出的纯逻辑上。真要测组件渲染时，把 environment 换成 'jsdom' 即可。
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // 纯函数跑一次在毫秒级，15s 还没结束基本就是写出了死循环
    testTimeout: 15_000,
    reporters: ['default'],
  },
})
