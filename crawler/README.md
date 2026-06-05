# job-crawler-service

Offer 捕手 M6「智能岗位匹配」的爬虫服务。独立 Node + Fastify + Playwright 进程,负责从 BOSS 直聘和 51job 抓取岗位列表与 JD 详情。

## 快速开始

```bash
cd job-crawler-service
npm install
npx playwright install chromium    # 安装浏览器
cp .env.example .env
npm run dev                        # tsx watch,改文件自动重启
```

服务起在 `http://localhost:3030`。

## API

所有 POST 路由必须带 `X-API-Key: <CRAWLER_API_KEY>` header。GET /health 免鉴权。

### POST /search
```json
{
  "role": "产品经理",
  "city": "上海",
  "page": 1,
  "limit": 20,
  "platforms": ["boss", "51job"]
}
```

返回:
```json
{
  "jobs": [{ "id": "boss_xxx", "title": "...", ... }],
  "blockedPlatforms": [],
  "total": 35,
  "hasNext": true,
  "cached": false
}
```

任一平台抓取失败不阻塞另一个;两个都失败才 503。

### POST /detail
```json
{ "jobId": "boss_xxx", "platform": "boss" }
```

### GET /health
公开探活,返回服务状态。

## 反爬策略

- `playwright-extra` + `puppeteer-extra-plugin-stealth` 注入反爬补丁(清除 WebDriver 特征等)
- UA / Viewport / 语言 / 时区在 newContext 时随机化
- 每次请求间随机 sleep 1-3 秒
- 检测到 302 / 验证码页 → 立即返回 503,不硬撑
- per-platform p-queue 限速

## Docker

```bash
docker build -t job-crawler-service .
docker run -p 3030:3030 --env-file .env job-crawler-service
```

## 架构图

参考 `PM产出物/12-M6岗位匹配技术方案.md`
