# QA Click-Sweep Log — feat/qa-click-sweep

自主 QA：用程序化 Playwright(headless,独立 context)把全站每个可点元素在【游客】+【登录】两种身份下点一遍,猎闪烁 / 双跳 / 缓存过期 / 上下文丢失,当场修。

- 基址:http://localhost:3200(`PORT=3200 npm run dev`,本 worktree 独立 node_modules)
- 测试账号:flytest0610@gmail.com(登录态)
- 驱动脚本:`scripts/qa/`(`_lib.js` harness + 每个流程一个可重复脚本 = 回归集)
- 基线:tsc 0 err · vitest 61 passed · eslint baseline(use-local-state 3 / discover 2 个既有 set-state-in-effect error,不新增)

## Harness 能力(对应 bug 类型)
- 双跳:`page.on('framenavigated')` 累积主 frame URL 序列;一次点击产生 >1 次导航 = 双跳信号
- 闪烁:点击后立即读关键文案 → settle 后再读,对比"先错后对"
- 上下文丢失:断言落地 URL 带正确 `?c=` + 关键文案在
- console/pageerror:逐条记录
- 登录态:`newLoggedIn` 先 networkidle + 等 hydration 再提交(dev 模式 hydration 滞后会吞掉点击),拿 cookie 持有 session

---

## 发现表

| # | 严重度 | 模块 | 复现步骤 | 根因 | 修复 | 验证 |
|---|--------|------|----------|------|------|------|
| 1 | 严重(种子) | 看岗位 /m6/discover | 登录/游客灌简历 A → 用简历推荐出卡片 → 去改简历换成简历 B → 回看岗位推荐 tab | 推荐缓存(`recommendedJobs`+`matchMeta`,useLocalState 持久化)在底层简历变化时没失效,旧的 A 卡片被当作当前结果静默展示 | 用简历内容签名(djb2 of `parsedResume`)给缓存加 key,存 `DISCOVER_RECOMMEND_SIG`;签名变了就清空缓存 + 黄条提示"简历已更新,已清空,请重新推荐"。失效 effect 依赖带上 `recommendSig`/缓存条数,兼容 useLocalState 异步 hydrate | `scripts/qa/test-seed-cache.js`:CASE1(签名一致→卡片保留不误清)PASS;CASE2(简历 A→B→卡片清空+提示+缓存清空)PASS |

---

## 每轮记录

### 准备 + Round 0(harness 搭建 + 种子 bug)
- worktree `oc-qa-sweep` @ feat/qa-click-sweep;npm ci;playwright + chromium 独立安装;dev server :3200 起。
- harness 验证:全站 10 个顶层路由 guest + 登录各跑一遍 smoke,无 console/pageerror,无意外 redirect(/profile 未登录 → /login?next= 正确)。
- 排除疑似 bug:登录态 m3/m5/m2/m4 一度疑似"游客模式闪现",经 commit 级 + 250ms 采样双探针确认**无 guest flash**(此前是 grep 串行混行误判)。auth 渲染正常。
- 修复 #1 种子 bug(见发现表)。
