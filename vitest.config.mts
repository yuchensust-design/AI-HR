import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// m5 v5 升级单测配置（隔离 devDep，不影响 Next build / 生产 bundle）
// 只跑 lib 下的纯函数单测，复用 tsconfig 的 @/* → ./* 别名
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
