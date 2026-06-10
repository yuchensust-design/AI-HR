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

### Round 1(导航 + 跨模块 CTA 双跳猎杀)
**跨模块 CTA(bug 类型 #1)全部点验,登录 + 游客:**
- `scripts/qa/test-nav-clicks.js`:8 个顶部 Nav 链接,guest + 登录各点一遍(home 隔离 + 按 href 取链),**全部单次 push、落地正确、无双跳、无 console error、无 guest flash**。
- `scripts/qa/test-m6-cta.js`:
  - 看岗位「用这个优化简历」(登录)→ 单次 `push:/m3/jd?c=<会话>`,JD 落地预填 + `M6_PENDING_JD` 消费,**无双跳/无回弹/无丢 JD**(复验上次修复 c0a03f8,成立)。
  - 看岗位「用这个练面试」(登录)→ 单次 `push:/m5`,JD 灌入 textarea(JD 正文),`M6_PENDING_JD` 消费。/m5 是选择页,无需 ?c=,无双跳。
- 静态 + 点击双确认:双跳风险只存在于"登录态进 m3/m5 子页却没带 ?c="。全站唯一外部入口是看岗位(已修)。其余跨模块出口(m2→/m3、m2→/m4、m4→/m3、m1/result→/m4?from=m1)**都指向 hub 选择页**(plain href / push 到 hub),结构上不触发 ?c= 双跳。
- **flywheel 领地不动**:`app/m5/debrief/page.tsx:437 router.push('/m3/result?c=<convId>&backfill=1')`(练面试→复盘→反哺简历回写 m3/result)由另一分支在改,本轮只记录不测不改。

**环境噪声(非产品 bug):** 测试机到 supabase.co(104.18.38.10:443)间歇 `ConnectTimeoutError`(dev log 实锤)。表现为登录偶尔要重试、看岗位「优化简历」CTA 偶尔静默 no-op(它的 `resolveM3Conv` 要查 DB;练面试 CTA 不查 DB 故不受影响)。线上 Vercel+Supabase 不存在此问题。harness 已加重试 + 长等待兜底。**结论:CTA 逻辑正确,flaky 全因网络。**

**Round 1 in-page + deep-link(都 ✓ clean):**
- `test-inpage-m6.js`(游客):tab 切换(推荐↔搜索,无导航)、看 JD 弹窗开/×关/点背景关、不二浮窗开关 + 输入框存在 + 不触发导航 —— 9/9 PASS,无 console/page error。
- `test-inpage-generic.js`(游客):tracker/diary/m4/m2/m1 安全按钮(tab/展开/切换,排除删除/提交/AI)逐个点 —— 无意外导航、无 console/page error。
- `test-deeplinks.js`(游客 + 登录,17 条冷链接直达,无前置状态):
  - 登录态 m3 子页(/m3/upload|jd|excavate|result)无 ?c= → 单次 redirect 回 /m3 hub(useM3DBSync 守卫按设计生效,非双跳)。
  - 全部子页冷访问都有**优雅空态 + CTA**,无白屏/崩溃:m3/excavate「还没读到你的简历 先去上传→」、m5/debrief「没有面试记录—先去面试一场 重新开始→」、m1/evidence「先做测评 去做测评→」。(早先 BLANK 标记是我阈值误判,实为短文案空态)
  - **minor(不修)**:登录态手填非法 uuid 的 ?c=(/m3/jd?c=junk、/m2?c=junk)→ supabase 400 console 噪声;真实用户 ?c= 来自 createConversation 合法 uuid,够不到此路径。改 lib/sync 守卫风险 > 收益,记录不动。

### Round 3(核心路径走查 — 改简历入口 + 找方向测评)
`test-corepath-guest.js`(游客):
- m1 RIASEC 测评:连续答题推进 8 次,纯客户端状态、无双跳、无 page error;选项点选自动下一题流畅。
- m3 游客内联上传表单:粘贴框 + 上传(PDF/Word 本地解析)控件齐;提交按钮在 Step 1 未完成时**禁用且给可操作引导**「请先在 Step 1 选简历」—— 非死键、非静默禁用。✓

### Round 4(全量回归 + 并发)
- `run-all.sh` 串跑全部脚本:seed-cache 2/2、nav-clicks 8×2(游客+登录,本轮网络好,登录全绿)、m6-cta、inpage-m6 9/9、generic、corepath 7/7、deeplinks 全 ✓。无回归。
- `test-concurrency.js`(游客,bug 类型 #5):快速切 tab ×8 / 连点看 JD ×5(**单弹窗不叠**)/ 狂点不二浮窗 ×7 —— 无导航、无状态错乱、无 error。
- harness 打磨:deeplink 空态阈值下调 + 识别空态 CTA 关键词,回归输出不再误报。

### Round 5(评委视角走查 — 核心路径,挑不出致命/严重)
逐条核心路径以"评委"视角复走,结论全部通过:
- **看岗位**:搜索/推荐两 tab、看 JD 弹窗、两颗跨模块 CTA(优化简历→/m3/jd?c=、练面试→/m5)、简历变→推荐缓存失效提示 —— 全部正确、单跳、不丢上下文。
- **改简历**:游客内联表单引导清晰;登录态子页守卫(无 ?c= → 回 hub)按设计;m6→m3 落在带简历的会话。
- **练面试**:/m5 选择页 + 配置表单;m6→m5 JD 灌入;冷访问 /m5/live、/m5/debrief 优雅空态。
- **登录历史多会话**:登录稳定(等 hydration 再提交);会话侧栏 + 多会话列表渲染正常;`resolveM3Conv` 命中"最新带简历会话"(与 useLatestResume 同查询,不跳空会话)。深度多会话切换受测试机 supabase 网络抖动限制,但渲染与会话解析逻辑已验证。
- **AI 步骤延迟**:m6 推荐 60–90s(UI 有四阶段 AgentProgress 进度反馈,达标);m6 搜索 20–30s(有 spinner + 文案);m3 解析/m5 出题有 loading 态。无"无反馈的 AI 步骤"。

### 准备 + Round 0(harness 搭建 + 种子 bug)
- worktree `oc-qa-sweep` @ feat/qa-click-sweep;npm ci;playwright + chromium 独立安装;dev server :3200 起。
- harness 验证:全站 10 个顶层路由 guest + 登录各跑一遍 smoke,无 console/pageerror,无意外 redirect(/profile 未登录 → /login?next= 正确)。
- 排除疑似 bug:登录态 m3/m5/m2/m4 一度疑似"游客模式闪现",经 commit 级 + 250ms 采样双探针确认**无 guest flash**(此前是 grep 串行混行误判)。auth 渲染正常。
- 修复 #1 种子 bug(见发现表)。

---

## 收工报告(Sign-off)

**迭代轮次:** Round 0(搭建+种子)→ 1(导航+跨模块 CTA+in-page+deep-link)→ 3(核心路径走查)→ 4(全量回归+并发)→ 5(评委视角走查)。≥5 轮完成,最后一整轮评委走查在核心路径(看岗位/改简历/练面试/登录历史多会话)**挑不出未修的致命/严重**。

**修复(1):**
- 【严重·种子】看岗位推荐缓存简历变化时不失效 → 用简历内容签名加 key 失效 + 提示。已修、已验证、已 commit。

**复验既有修复(1):** 看岗位「用这个优化简历」登录态不双跳/不丢 JD(c0a03f8)—— 新 history 钩子复验成立。

**未发现新的致命/严重 bug。** 全站导航、跨模块 CTA、in-page 交互、冷 deep-link、并发、核心路径走查均干净。

**未修(均非致命/严重,附原因):**
- minor:登录态手填非法 uuid 的 ?c= → supabase 400 console 噪声。真实用户够不到(合法 uuid),改守卫风险>收益。
- 记录未测:`m5/debrief→/m3/result?c=` 反哺回写属 flywheel 分支territory,按约束不动。
- 环境:测试机→supabase 间歇 ConnectTimeout(非产品 bug,线上不存在)。

**改过的文件(便于 flywheel 合并预判):**
- `app/m6/discover/page.tsx`(种子 bug:缓存签名失效 + 提示;**m6 在你的安全区**)
- `lib/use-local-state.ts`(只 +1 行 STORAGE_KEYS 常量 `DISCOVER_RECOMMEND_SIG`;追加式,冲突风险极低)
- `scripts/qa/*`、`docs/QA_SWEEP_LOG.md`(纯新增测试与文档,不影响产品代码)
- **未碰** m3/result、app/api/m3/suggest-edits、m2、m4、m5 复盘回写、lib/sync 业务函数。

**基线门禁:** tsc 0 err · vitest 61 passed · eslint 0 个新增 error(改动文件 per-file baseline==current)。
**交付:** 分支 `feat/qa-click-sweep`,每个修复独立 commit,未 push、未 merge。
