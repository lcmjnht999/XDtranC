import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // e2e 由 Playwright 运行，不能被 Vitest 收集。
    // 必须排除 node_modules：pnpm 的 workspace 链接会让 engine 测试被重复收集。
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', 'e2e/**', 'release/**', 'dist/**'],
    testTimeout: 30_000,
  },
});
