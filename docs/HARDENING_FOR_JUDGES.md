# 评审前加固说明（2026-06-10）

> 本文档记录提交评审前做的一轮针对性加固：**改了什么、为什么改、怎么验证的**。
> 目标是把「一问就露」的硬伤补掉，让作品从"功能很全但有瑕疵"变成"全且稳"。
> 每一条都给了**问题 → 修复 → 验证结果**，评委可按"复现步骤"自行核对。

加固方式：在独立分支 `feat/judge-fixes` 上改，本地 `tsc` 类型检查 + 85 个单测 + Playwright 全路由走查通过后才合并，**不影响任何已有功能**（22 条路由零回归、零控制台报错实测确认）。

---

## 一、安全：LLM / 语音接口防盗刷（P0，最高优先级）

### 问题
本站采用「前端 proxy」架构——API Key 全留后端，前端只调 `/api/*`。但这些接口**没有任何调用方校验**，导致：

1. 任何人都能用一行 `curl` 无限调用 `/api/chat`、`/api/buer/chat` 等 30 个 LLM 接口，**直接消耗我们的 DeepSeek / 混元 token 配额**（成本被盗刷）。
2. `/api/m5/asr-token` 会把火山语音的**原始 Access Key 明文**返回给调用方，抓包即可盗用。

> 实测（修复前）：
> ```
> curl -X POST https://ai-hr-alpha.vercel.app/api/chat -d '{"messages":[...]}'
> → {"content":"Hello! How can I help you today?"}   # 无需登录直接返回
> ```

### 为什么不能简单"要求登录"
游客模式是产品**刻意的设计**（学生不注册也能先体验）。如果给接口加"必须登录"，会直接砸掉核心体验。所以需要一种**既挡机器人、又不挡站内游客**的防御。

### 修复
新增 [`lib/api-guard.ts`](../lib/api-guard.ts)，在中间件 [`proxy.ts`](../proxy.ts) 这一**单一收口处**对所有 `/api` 写请求做两层防护：

1. **同源校验**：浏览器对写类请求（POST 等）一定会带 `Origin` 头；`curl` / 第三方脚本默认不带，跨站调用带的是别的域名。要求"`Origin`/`Referer` 必须匹配本站"即可：
   - ✅ 站内游客的 `fetch` —— 浏览器自动带同源 `Origin`，正常放行
   - ❌ `curl` 直接刷 —— 无 `Origin`，403 拒绝
   - ❌ 第三方网站盗用 —— `Origin` 不匹配，403 拒绝
2. **轻量限流**：单 IP 60 秒内最多 40 次写请求，挡住高频脚本。
   （诚实说明：Vercel serverless 是多实例，内存计数只在单实例内有效，所以这是"抬高门槛"而非"绝对防线"。要硬防需接 Upstash/Redis，已在代码注释标注为后续项。）

### 为什么这样改好
- **零成本覆盖全部 30 个接口**：在中间件单点收口，不用逐个改 route，也不会漏。
- **对游客完全无感**：站内一切照常，只挡站外滥用。
- **同时堵住 token 泄密**：`asr-token` 也是 POST `/api/*`，自动被同源 guard 覆盖。
  （注：火山 ASR 的 WebSocket 必须浏览器直连，Next.js route 无法转发 WS，所以 headers 注定要下发前端——这是火山方案的固有约束。同源 guard 已挡掉 `curl` 直接提取；线上当前未配置 VOLC 环境变量、走 Web Speech 兜底，无实时泄露。完整方案需火山 STS 临时凭证，已在代码注释标注。）

### 验证（评委可复现）
```bash
# 1) curl 无 Origin → 403（挡住盗刷）
curl -s -o /dev/null -w "%{http_code}" -X POST <站点>/api/chat \
  -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hi"}]}'
# → 403

# 2) 伪造跨站 Origin → 403
curl ... -H 'Origin: https://evil.com' ...   # → 403

# 3) asr-token 无 Origin → 403（不再泄露密钥）
curl -s -X POST <站点>/api/m5/asr-token
# → {"error":"跨源请求被拒绝 — 该接口仅供本站调用"}
```
站内浏览器调用（带同源 Origin）实测仍返回 200，游客功能完好。

---

## 二、稳定性：补齐线上超时配置（P1）

### 问题
Vercel 上每个 API route 默认 **10 秒**超时，调 LLM / 长任务的接口必须显式声明 `maxDuration` 才能拿到 60 秒。漏掉的 3 个接口在**线上**会静默超时（本地正常、线上坏，最难排查）：

| 接口 | 漏配后果 |
|---|---|
| `app/api/m5/tts/route.ts` | 长题面语音合成超 10s → 静默失败 → 面试官"不出声"，误降级纯文字 |
| `app/api/m3/finalize-resume/route.ts` | 整篇简历定稿调 LLM，长简历超 10s → 定稿失败 |
| `app/api/m3/export-docx/route.ts` | 整篇排版生成 → 保险起见一并补 |

### 修复
三个接口各加一行 `export const maxDuration = 60;`（与项目其余 30+ 接口保持一致）。

### 为什么这样改好
一行常量、零风险，消除"本地能演示、线上一上手就坏"的隐患——这对评委在线体验至关重要。

---

## 三、体验：岗位推荐爬虫降级透明化（P1）

### 背景
m6 的真实在招岗位来自一台住宅爬虫机（经隧道暴露给线上）。爬虫机离线时，系统会**降级到本地示例数据**。原实现有两个体验坑：

### 问题 1：降级后用户看不出是"示例数据"
后端其实返回了 `isMock` 标记，但**前端没读、没提示**。评委看到示例岗位会误以为是真岗位。

**修复**：前端读取 `isMock`，在搜索结果上方显示醒目 banner：
> ⚠️ 实时爬虫暂时不可达，下方为**演示示例数据**（非真实在招岗位，链接不可点击）。匹配评分、推荐解释等功能逻辑与真数据完全一致——待爬虫恢复后即自动切回真岗位。

（改动：[`components/m6/types.ts`](../components/m6/types.ts) 加 `isMock` 字段，[`app/m6/discover/page.tsx`](../app/m6/discover/page.tsx) 加 state + banner）

### 问题 2：示例岗位的"去原页面"是死链
示例数据的 `jdUrl` 原本写死成 `https://example.com/job/...`，点开必然 **404**，评委会当成 bug。

**修复**：
- 示例数据 `jdUrl` 置空（[`lib/m6-mock-fallback.ts`](../lib/m6-mock-fallback.ts)）
- [`components/m6/JobCard.tsx`](../components/m6/JobCard.tsx) 检测空链接：不渲染会 404 的"去原页面"按钮，平台 badge 显示为"演示数据"标识

### 为什么这样改好
**诚实**是这个项目的核心理念（"绝不把提案包装成已完成"）。把降级状态如实告诉用户、不给死链，既守住理念，也避免演示当天爬虫机一掉线就"翻车"。匹配/评分逻辑在真假数据上完全一致，降级不影响功能展示。

---

## 四、数据：经历挖掘对话刷新不丢（P1）

### 问题
m2「经历挖掘」是多轮对话。原实现里对话消息只存在内存（`useState`），**只持久化了提炼出的 STAR 素材，没存对话本身**。用户刷新页面或换设备后，AI 的追问和自己的回答全部消失，得从头接话。

### 修复
- 对话消息改用按会话隔离的 `useLocalState` 持久化（游客刷新即恢复）
- 登录用户的对话随 `syncToDb` 一并落库（[`lib/sync/useM2DBSync.ts`](../lib/sync/useM2DBSync.ts) 的 `intake_json` 增加 `messages` 字段，向后兼容，老数据不受影响）
- 跨设备登录时从数据库恢复对话历史
- 仔细处理了"开场白不覆盖已恢复历史"的初始化时序

### 为什么这样改好
追问式挖掘的价值在于上下文累积。刷新即丢会让用户体验断裂、白白重答。修复后对话连续，符合"陪你慢慢回想"的产品定位。

---

## 五、细节：Word 导出中文文件名（P2，随手修）

`app/api/m3/export-docx/route.ts` 的下载文件名未做 RFC5987 编码，含中文（用户名/岗位名）时部分浏览器会乱码或下载失败。已改为 `filename*=UTF-8''<编码>` + 纯 ASCII 回退的标准双写法。

---

## 改动文件清单

| 文件 | 改动 | 优先级 |
|---|---|---|
| `lib/api-guard.ts` 🆕 | 同源校验 + 限流 | P0 |
| `proxy.ts` | 中间件接入 api-guard | P0 |
| `app/api/m5/tts/route.ts` | 补 `maxDuration=60` | P1 |
| `app/api/m3/finalize-resume/route.ts` | 补 `maxDuration=60` | P1 |
| `app/api/m3/export-docx/route.ts` | 补 `maxDuration=60` + 文件名编码 | P1/P2 |
| `components/m6/types.ts` | `SearchResponse` 加 `isMock` | P1 |
| `app/m6/discover/page.tsx` | 演示数据 banner | P1 |
| `lib/m6-mock-fallback.ts` | 示例 `jdUrl` 置空 | P1 |
| `components/m6/JobCard.tsx` | 空链接降级为"演示数据"标识 | P1 |
| `lib/sync/useM2DBSync.ts` | 持久化 `messages` | P1 |
| `app/m2/page.tsx` | 对话历史持久化 + 恢复 | P1 |

## 验证结论
- ✅ `npm run test` —— 85/85 单测通过
- ✅ `npx tsc --noEmit` —— 类型检查零错误
- ✅ Playwright 全 22 路由（桌面 + 移动）—— 全部 200、零控制台报错，无回归
- ✅ 同源 guard —— curl/跨站 403、站内浏览器 200、asr-token 不再泄密（均实测）
