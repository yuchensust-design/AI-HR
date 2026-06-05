# Playwright 官方镜像自带 chromium + 字体 + 系统依赖
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

# 先复制依赖文件,利用 Docker 层缓存
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install

# 拷代码
COPY tsconfig.json ./
COPY src ./src

# 构建
RUN npm install -D typescript && npx tsc

# 暴露端口
EXPOSE 3030

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3030/health || exit 1

CMD ["node", "dist/server.js"]
