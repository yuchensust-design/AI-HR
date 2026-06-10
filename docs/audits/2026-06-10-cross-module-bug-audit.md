<!-- 多 agent 工作流审计 wf_9866372b · 2026-06-10 · 28 agents · 22 疑似→9 确诊/13 排除 -->

# Offer 捕手 跨模块上下文与 LLM 配置审计 · 确诊清单

本次对抗式复核共确诊 **9 条** bug，整体健康度判断为 **不健康（存在线上级别故障）**：最严重的是 **类①「永远取最新简历」反模式导致的跨模块静默串简历**（1 条 blocker + 2 条 high + 2 条 low），它会让用户在改简历/补项目/模拟面试之间跳转时被悄悄换成账号里另一份简历，且全程无报错、无提示，属于数据正确性事故。其次是类②异步预填冻结（M4 目标岗位/JD 填不进）、类③ LLM 批量评分截断导致整批岗位静默消失、以及类④三处「新设备/auth 未就绪时云端数据读不回」竞态。这些缺陷的共同特征是**静默失败**——不崩、不报、用户看到的是"看起来正常但其实是错的/缺的"数据，比 502 更难被发现。

---

## Blocker

### 1. 跨模块「永远取最新简历」反模式：M4 补项目回流时把项目素材种到账号旧简历（静默串简历）

- **位置**：[app/m4/page.tsx](app/m4/page.tsx):199-207 / 222-228 / 614（saved 分支 `return savedParsed` 不持久化）对比 629-632（"换一份"分支才 `setItem(PARSED_RESUME)`）；牵涉 [app/m1/result/page.tsx](app/m1/result/page.tsx)、[app/m3/result/page.tsx](app/m3/result/page.tsx)、[app/m5/page.tsx](app/m5/page.tsx)、[app/m5/debrief/page.tsx](app/m5/debrief/page.tsx)、[app/m6/discover/page.tsx](app/m6/discover/page.tsx)、[app/m2/page.tsx](app/m2/page.tsx)
- **复现**：登录的多简历用户，从某条**非最新**的改简历会话点「补项目」（`/m4?fromm3=<该会话id>`），M4 用该会话简历做差距分析后点「采纳进简历」→ 新建的 m3 回流会话里被灌进的是 localStorage `PARSED_RESUME` 那份（账号最近编辑/其它设备残留/为空），而不是这次实际用的那份。
- **证据**：`resolveParsedResume()` 在 saved 模式第一行 `return savedParsed`，**从不**写 `PARSED_RESUME`；只有 new 模式才 `localStorage.setItem(PARSED_RESUME, parsed)`。而 `handleAdoptToResume` 在 :202-203 直接 `JSON.parse(localStorage.getItem(PARSED_RESUME))` 当作"M4 这次用的简历"。`savedParsed = handoffParsed ?? latestResume.parsedResume`——handoffParsed 来自 `?fromm3=` 的 DB 行（全程不落 localStorage），latestResume 取 `m3_resumes` updated_at 最新行（也不落 localStorage）。于是读到的与本次实际所用简历无关，可能是别份简历或 `null`，被 `update({parsed_resume_json})` 种入新会话（**无 null 守卫**）后 `router.push(/m3?c=<convId>&setup=1)` 当成"这次补项目用的简历"显示。fromm3 路径（必然多会话+非最新）必现；saved 无 handoff 路径在换设备/清缓存时会种入 null。
- **建议修法**：`handleAdoptToResume` 不再读 localStorage `PARSED_RESUME`，改用组件内"本次实际所用 parsed"的单一真相（saved 时 `savedParsed=handoffParsed`、new 时 `parsedCache`），作为参数上提种入新会话；或在 `resolveParsedResume` 的 saved 分支也 `localStorage.setItem(PARSED_RESUME, JSON.stringify(savedParsed))` 持久化本次简历；并对 `m4Parsed` 为空时中止采纳、不种入 null。
- **置信度**：high

---

## High

### 2. M4 fromm3 回流采纳读 localStorage `PARSED_RESUME`（从未写入该份）→ 项目素材种到账号旧简历

- **位置**：[app/m4/page.tsx](app/m4/page.tsx):199-207（读 `PARSED_RESUME` 作"M4 这次用的简历"）+ 222-228（种入新 m3 会话）+ 614（saved 分支 `return savedParsed` 不持久化）对比 629-632（"换一份"分支才 `setItem`）
- **复现**：登录多简历用户，m3/result 看会话 X（简历 X）→ 点「补项目」（`/m4?fromm3=Xconv`）→ 用已有简历分析+做完项目→送进简历优化→新建 m3 会话的 `parsed_resume` 是残留的 Y 而非 X。
- **证据**：这是 #1 同一根因链路的具体走查坐实（类①静默串简历，与类②冻结无关）：① `handleAdoptToResume` 直接把 `localStorage.getItem(PARSED_RESUME)` 当作"本次用的简历"；② 本次实际所用是 `savedParsed=handoffParsed`，后者按会话 X 读 DB（`.eq("conversation_id", fromM3)`），**全程不写 localStorage**；③ `resolveParsedResume` 的 saved 分支直接 return 不持久化，useLatestResume 也只读 DB；④ 上游 m3/result 看 X 时只 `saveField` 到 DB、**显式不** `setLocalParsedResume`，故 X 不会进 `PARSED_RESUME`；⑤ Y 的来源真实存在——m6/discover 内联上传（含登录用户）会 `localStorage.setItem(PARSED_RESUME, parsed)`（:424），m3 paste/upload 同理；⑥ 采纳落库后 `router.push(/m3?c=<newConv>&from=m4&setup=1)`，m3 setup 按该会话读 `parsed_resume_json` 显示 Y + X 的项目素材——恰好发生在注释自称"已修此 bug"的代码路径里。登录态走 DB 种会话触发。
- **建议修法**：同 #1——以组件内"本次实际所用 parsed"单一真相为准传上来种入，或在 saved 分支持久化 `savedParsed`。
- **置信度**：high

### 3. M4 IntakeForm 目标岗位/JD 预填灌进冻结 useState（`JD_CONTEXT` 总线路径和 `?from=m1` 路径都没兜住）

- **位置**：[app/m4/page.tsx](app/m4/page.tsx):557-558（useState 冻结）；318-322（prefill 来源）；245-254（m1TargetRole 异步）；182-185（jdContext useLocalState 异步）；267-303 / 422-438（handoffPending 只兜 fromm3）
- **复现**：从 M1 结果页点「去补项目」（→ `/m4?from=m1`），或带着已存的 `jd_context` 经导航打开 `/m4`，观察目标岗位/JD 框为空。
- **证据**：挂载首帧初值确为空且被冻结：① `jdContext=useLocalState(JD_CONTEXT,null)` 首帧 = null（异步 hydrate 才晚到）；② `m1TargetRole=useState(null)` 仅在 useEffect 里异步 set，首帧 null（即便 m1/result 在 push 前已同步写 localStorage，M4 仍走异步读，晚一拍）；③ `prefillRole`/`prefillJd` 在非 fromm3 路径首帧皆 `""`；④ 网关只兜 fromm3——`handoffPending` 初值 `=!!fromM3`，`from=m1`/纯总线路径 fromM3=null → handoffPending=false → 立即挂载 IntakeForm，**无 key**；⑤ IntakeForm 首帧 `role=useState(initialRole)`、`jd=useState(initialJd)` 捕获空初值并冻结，全文 `setRole/setJd/setSrcLabel` 仅出现在用户输入 handler，**无任何把 initial 同步回 state 的 useEffect**，父组件一拍后更新但子 useState 已冻结 → role/JD/Badge 永久填不进。简历经 `savedParsed` prop 响应式派生，故只丢 role+JD，不丢简历、不串简历。
- **建议修法**：把 fromm3 的 loading-gate 推广到这两条入口（jdContext 用 useLocalState 的 loaded 标志、m1TargetRole 读完前 `handoffPending=true` 不挂表单）；或给 IntakeForm 加 `key={`${prefillRole}|${prefillJd}`}` 让值就绪后重挂；或在 IntakeForm 内加 useEffect 在 initial 由空变非空时 `setRole/setJd/setSrcLabel`。
- **置信度**：high

### 4. m6/match-resume Scorer 批量评分 10 job/batch @ max_tokens=3000，截断后整批静默丢失

- **位置**：[app/api/m6/match-resume/route.ts](app/api/m6/match-resume/route.ts):162-163（batch=10）/ 191（chat max_tokens=3000）/ 193（`JSON.parse` 截断抛错）/ 204-205（catch 仅 `console.warn`）/ 230（filter 掉无分岗位）
- **复现**：用户在 m6「看岗位」用简历跑推荐，当某个评分批刚好凑满 10 个长 JD 岗位时，这 10 个岗位会从结果列表里整批静默消失（无报错、无提示）。
- **证据**：一批最多 10 个 job（3 关键词×limit=10 去重后满批可达）；Scorer prompt 输出 schema 已升级为**每 job 7 维 breakdown + 3 条 highlights（引 JD+简历原文 ~40-60 字）+ 3 条 gaps（~50-70 字）**，单 job 实测 ~600-900 token，10 job≈7000-9000 token，**远超 3000 上限** → JSON 中途截断 → `JSON.parse(raw)` 抛错 → catch 仅 `console.warn("Scorer batch failed")`，该批 10 个 job 一个 score 都不 push → `merged.filter(j=>j.matchScore!==undefined)` 把无分岗位整批过滤 → 最终 `jobs[]` 里彻底消失，`stats.scored` 静默减 10，无 502、无 warning 字段、无用户可见反馈。注：suspect 提到的 maxDuration 无问题（route.ts:30=90）；breakdown 已是 7 维反使截断更严重。这是比 502 更隐蔽的静默数据丢失。
- **建议修法**：batch 从 10 降到 4-5（:162），Scorer max_tokens 提到 6000-8000（:191）；catch 里至少对该批 jobId 做默认分降级或在 stats 上报失败批，而非整批丢弃。
- **置信度**：high

### 5. tracker 页 loadFromDB 在 auth 未 resolve 前跑且永不重试 → 登录用户云端记录读不到（空表）

- **位置**：[app/tracker/page.tsx](app/tracker/page.tsx):66-71
- **复现**：登录用户在新设备（或清过浏览器缓存）打开 `/tracker`：页面显示"还没有投递记录"空表，云端 `tracker_applications` 里的记录读不出来。
- **证据**：① `useUser` 初始 user=null、loading=true，真实 user 经异步 `getUser().then` 才落定；② `useTrackerDBSync` 的 `loadFromDB` 第一行 `if (!user) return null;`，useCallback deps=[user]；③ tracker 页 useEffect **deps=[]**（带 eslint-disable），仅挂载首帧执行一次，首帧 user=null → loadFromDB 立即返回 null → 不 setApplications；此后 user 落定使 loadFromDB 重建，但 effect 因 [] 永不重跑 → 云端记录永远不加载；④ applications 来自 `useLocalState(tracker_applications_v1, [])`，新设备 localStorage 为空 → 渲染空状态。对照 `useM3DBSync`（`if (userLoading) return;` + deps 含 userLoading）、`useM2DBSync`（同款门控 + isReady）都在 auth resolve 后重跑，唯独 tracker 这条没有 userLoading 门、也没把 user 放进 deps，确属遗漏；guest 迁移只 local→DB 单向，救不了 DB→本地这条读取路径。
- **建议修法**：让 `useTrackerDBSync` 暴露 `userLoading`（或 `isReady`），tracker 的 useEffect 改为 `if (!userLoading) loadFromDB().then(...)` 且把 `[userLoading, user?.id]` 放进 deps（对齐 useM2/M3DBSync 的门控模式）。
- **置信度**：high

---

## Medium

### 6. m5 `?fromm3=` 行简历过短（txt≤20）时回退到 useLatestResume → 简历悄悄串成账号最新

- **位置**：[app/m5/page.tsx](app/m5/page.tsx):212-220（`txt.trim().length>20` 才置 `m3ResumeAppliedRef=true`）+ 226（无条件 `setM3Loaded('done')`）+ 288-307（latest effect 在 ref=false 时用账号最新简历覆盖）
- **复现**：登录用户从某 m3 会话进 `/m5?fromm3=<会话id>`，但该会话简历文本很短（≤20 字符）→ JD 来自指定会话、简历却被账号最新那份悄悄盖回。
- **证据**：fromm3 effect 只在 `txt.trim().length>20` 时才 `setSavedResumeText`/`setResumeSource("saved")`/`m3ResumeAppliedRef.current=true`；txt≤20 时这些全跳过，ref 保持 false。:226 无条件 `setM3Loaded('done')`。随后 latest effect：loading 转 false + `m3Loaded==='done'` 通过 + `if (m3ResumeAppliedRef.current) return;` 因 ref=false 不返回 → `setSavedResumeText(latestResume.resumeText)`，且因 autoPickedResumeRef 仍 false 而 `setResumeSource(cur=>cur??'saved')` 置 saved。useLatestResume 查询 `.order('updated_at',desc).limit(1)` 取账号最新行，不按 fromM3 过滤——JD 来自指定会话、简历串成账号最新，正是类①"本该带特定那份却落到取最新"。
- **建议修法**：fromm3 命中 data 后**无条件**置 `m3ResumeAppliedRef.current=true`（即便 txt≤20 也不许回退到账号最新）；txt≤20 时设提示"该会话简历为空，请上传/粘贴"且不自动选 saved。
- **置信度**：high

### 7. m5/live config 加载 `.then` 无 `.catch` → DB reject 时不 dispatch ERROR，永久停在 loading

- **位置**：[app/m5/live/page.tsx](app/m5/live/page.tsx):354-368
- **复现**：登录用户点历史面试会话进入 `/m5/live?c=<id>`，此时网络中断/请求被 abort（transport 层失败）导致 supabase 查询 promise reject → 页面永久停在"正在按你的简历出题…"loading 屏，无错误提示、无回 `/m5` 入口。
- **证据**：登录+convId 分支 `supabase.from('m5_interviews').select('config_json')...maybeSingle().then(({data})=>{...})` 只有 `.then` 没有 `.catch`，该分支自己 return cleanup 后退出 effect，:373-391 的 localStorage 兜底（且仅它被 try/catch 包裹）对登录用户走不到。RLS 拒读/无行属于 resolve 成 `{data:null}` → 命中 `if(!cfg||!cfg.jd_text)` → dispatch ERROR（这条好的）；只有真正 promise reject（网络断/abort/CORS/DNS/maybeSingle 抛错）才两边都不触发：config 恒 null、status 恒 "loading"、errorMsg 空 → 命中 render `if (status==="loading"||!config)` 显示纯 loading 屏，且 errorMsg 空使内联错误也不显示 → 死在 loading 无反馈。外层 try/catch 捕不到异步 rejection。
- **建议修法**：给 :359 的 `.then` 链补 `.catch(()=>{ if(!cancelled) dispatch({type:'ERROR', msg:'读取面试配置失败 — 请检查网络后回 /m5'}) })`。
- **置信度**：high

### 8. diary 页登录用户无 loadFromDB 回灌 → 新设备看不到云端日记（本地空时静默无数据）

- **位置**：[app/diary/page.tsx](app/diary/page.tsx):242-246
- **复现**：登录用户在 A 设备写了日记（已双写进 `diary_entries` 表），换到 B 设备（或清 localStorage）打开 `/diary`，列表显示"小窝还空着"，云端日记不回灌、无"从云端恢复"。
- **证据**：进场 effect 只 `setEntries(getDiaryEntries())`，而 `getDiaryEntries()→read()` 纯读 localStorage `buer_diary_entries`，完全不碰 DB。`useDiarySync` 只返回 addEntry/deleteEntry/clearAllEntries 三个**双写**方法（都写 `diary_entries` 表），但**整个 hook 无 select / 无 loadFromDB**。对照 `useTrackerDBSync` 有 loadFromDB 且 tracker 页挂载回灌、`useM2DBSync` 有 loadFromDB 且 m2 页回灌——diary 是唯一没有 DB→local 恢复路径的。`migrateGuestDataOnLogin` 只 local→DB 单向 insert 且被 `hasMigrated()` 门控，新设备只把（空）本地推上去，永不从云端拉下来。故云端有数据、新设备本地空时列表静默显示空。数据未丢（DB 仍在），只是不可见。
- **建议修法**：在 `useDiarySync` 加 `loadFromDB`（select `diary_entries` where user_id → 映射回 DiaryEntry），并在 diary 进场 effect 里登录用户 `await loadFromDB()` 后 merge 进 localStorage 再 setEntries（像 tracker/m2 那样），游客保持原行为。
- **置信度**：high

---

## Low

### 9. m5/debrief 内联「取最新简历」查 hidden_experience_json 做「已采纳」回显 → 显示自洽但非会话绑定

- **位置**：[app/m5/debrief/page.tsx](app/m5/debrief/page.tsx):239-249
- **复现**：登录用户做面试 X 并采纳某亮点（→新建一条 m3 会话），再做面试 Y 的复盘里也采纳（该新会话成为 updated_at 最新），然后回 `/m5/debrief?c=X` 看复盘：X 里那条本已采纳的亮点显示成"可点采纳"（漏标）。
- **证据**：核心 :243 `.order("updated_at",{ascending:false})` 读最新 + :263 按 question_id 命中；而写入实际落新会话（:391/397-404，不走 backfill），与读取目标不一致；question_id 带 session.id 使只会**漏标不会误标**；fail-safe 仅显示态。属显示层瑕疵，无数据正确性损害。
- **建议修法**：把 :239-249 的"取最新简历"改成按本次复盘对应的简历会话读（登录态用 `?c=convId` → `.eq("conversation_id", ...)` 精确读 `hidden_experience_json`），而非 `order(updated_at).limit(1)`；若做类①收口，这处与 m6:362 两处内联应一并改为按会话绑定。
- **置信度**：high

---

## 按根因归类

### 类① 跨模块上下文传递「永远取最新」静默串简历 —— **系统性风险最高，必须根治**
命中 **#1（blocker）、#2（high）、#6（medium）、#9（low）** 共 4 条，覆盖 M4 采纳回流、M5 简历挑选、M5/debrief 已采纳回显，且 #9 还点名 **m6:362** 存在第二处内联复制同款查询。核心病灶是**两套真相并存**：跳转本应携带"特定简历+JD"，但持久化总线只有 `PARSED_RESUME` 单 key（last-writer-wins）+ `useLatestResume`/`resolveResumeRow` 的 `order(updated_at).limit(1)`，任何一处该带特定会话却落到"取最新/读单 key"上，就会静默错配。
**根治方向（不要逐个打补丁）**：
1. 废除"取账号最新简历"作为跨模块默认兜底——所有 m3↔m4↔m5 跳转一律用 `conversation_id`（`?fromm3=`/`?c=`）显式绑定，`useLatestResume` 仅保留给"无任何上下文的冷启动首页"，并在调用点强制传入 sessionId。
2. 把"本次实际所用 parsed/JD"收敛为**组件内单一真相**，采纳/回流时以参数传递落库，禁止任何 `handleAdopt` 类逻辑回头读 `localStorage.PARSED_RESUME`。
3. 审计并消灭 #9 点名的两处内联复制查询（debrief:243、m6:362），统一走会话绑定的读取函数。
4. 所有种入 `parsed_resume_json` 的 update 加 **null/空守卫**，空则中止并提示，杜绝种入 null。

### 类② 异步预填灌进冻结 useState —— **存在系统性模式风险**
命中 **#3（high）**。根因是"loading-gate 只为 fromm3 这一条入口写过"，而 `JD_CONTEXT` 总线、`m1_target_role`、`?from=m1` 等异步晚到的入口都没纳入门控，IntakeForm 又用 `useState(initialFromProp)` 冻结了首帧空值。
**根治方向**：建立统一约定——凡"初值来自异步 fetch/handoff/useLocalState 的表单"，要么父层 gate 到所有上下文 loaded 再挂载、要么子组件用 `key` 重挂、要么 initial 由空变非空时 useEffect 回填；并全仓 grep `useState(initial` + 异步来源组合，把 JD/岗位/纯文本框（不像简历走 prop 响应式）这类高危点一次性排查。

### 类③ LLM route 配置 —— **个案，但 prompt 升级会重新引爆**
命中 **#4（high）**。maxDuration 本身无问题，真正的雷是 **batch 大小 × 单条输出 token 与 max_tokens 不匹配**，且 prompt 升级（7 维 breakdown）后没有同步回看 token 预算 → 截断 → 整批被 catch 吞掉静默丢失。
**根治方向**：建立"prompt schema 变更需同步复核 batch×max_tokens 预算"的纪律；所有批量 LLM route 的 catch 不得整批丢弃，必须降级或在 stats 上报失败批，让数据丢失可见。

### 类④ 竞态 / RLS / 兜错吞掉 —— **存在系统性模式风险**
命中 **#5（high）、#7（medium）、#8（medium）** 共 3 条，全是"登录用户在新设备/auth 未就绪/网络抖动时云端数据读不回或卡死，且无反馈"。#5/#8 是 **DB→local 回灌路径缺失或被 `deps=[]`/缺 userLoading 门控破坏**，#7 是 **`.then` 无 `.catch` 吞掉 promise rejection**。
**根治方向**：
1. 统一"登录态 DB→local 回灌"为一套带 `userLoading` 门控 + `[userLoading, user?.id]` deps 的标准 hook（以 useM2/M3DBSync 为模板），tracker 对齐、diary 补齐 loadFromDB。
2. 全仓 grep `.then(` 的 supabase 调用，凡无 `.catch` 的一律补 reject→error 态，禁止 loading 死锁；外层 `try/catch` 不能假定能兜异步 rejection。

---

## 附录:已复核排除的 13 条(非 bug / 目标正确 / 已有护栏)

**1. useLatestResume / resolveResumeRow 的「取最新」语义本身——基础设施层，定性正确**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/lib/sync/useLatestResume.ts:101-131 (查询); lib/sync/hidden-experience.ts:63-81 (resolveResumeRow)`  
The suspected item itself scopes to "基础设施层，定性正确 ... 它本身不是 bug——是『当前简历』的代理。bug 只会发生在【本该带特定上下文】的调用点错误地落到它身上。" My read confirms this. (1) lib/sync/useLatestResume.ts:101-131: query is well-formed and RLS-scoped — .select("parsed_resume_json, final_resume_md, updated_at").not("parsed_resume_json","is",null).order("updated_at",{ascending:false}).limit(1).maybeSingle(); error/!data → fail-safe readLocal() (line 110-113), short/empty → readLocal() (line 127-129). It never throws and never mis-reports loading (loading guard at 83-88 keeps loading=true until auth resolves, so no auth-race localStorage misjudgment here). (2) lib/sync/hidden-experience.ts:63-81 resolveResumeRow uses the identical query for the write target; convId null → returns null → callers go to their own fallback (backfillHiddenToLatestResume returns null, line 93). (3) The contract is "account current resume," and every consumer that needs a SPECIFIC resume bypasses this hook via a higher-priority path: app/m5/page.tsx:181-232 reads the exact row by .eq("conversation_id", fromM3) and guards the hook from overwriting it (m3ResumeAppliedRef at :159, m3Loaded==="pending" gate at :291); app/m4/page.tsx:256-303 does the same with handoffPending (:267) blocking form render until the specific row loads. So this infra is purely the fallback proxy, not the source of any specific-context mis-pairing. The "取最新" semantics is intentional (documented at useLatestResume.ts:9-11) and correct for its job.

**2. m2 挖经历回流 backfillHiddenToLatestResume —— 目标正确(ok)**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/app/m2/page.tsx:559`  
app/m2/page.tsx:559 调用 backfillHiddenToLatestResume(createClient(), hidden);该函数(lib/sync/hidden-experience.ts:87-107)经 resolveResumeRow(同文件 63-81)查询 m3_resumes 过滤 parsed_resume_json 非空、order updated_at desc limit 1,即「最新一份有简历的会话」。这正是挖经历回流应落的目标:挖出的 bullet 是对用户当前在用简历的通用素材补充,没有需要保真的特定源简历+JD,所以「最新在用那份」恰是正确目标——与 brief 白名单及 hidden-experience.ts:9-12/58-61 文档注释、飞轮 spec §3 一致。无类②:handleSendToResume 是 useCallback(deps: bullets,fills,isGuest,router),点击时读闭包活值,不存在 useState 冻结初值。line 558 isGuest=!userId 在 userLoading 期的瞬态误判属类④且点击触发 auth 通常已落定,非本类「取最新错配」。

**3. m4 IntakeForm latestResume 作为 fallback —— 有 fromm3 handoff 优先,目标正确(ok)**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/app/m4/page.tsx:241 (hook); 572-574 (savedParsed = handoffParsed ?? latestResume)`  
app/m4/page.tsx:267 `useState<boolean>(!!fromM3)` initializes handoffPending=true whenever ?fromm3= is present. app/m4/page.tsx:419-441: the IntakeForm section renders only when `(projects.length===0 || showForm)` AND `!handoffPending`; while handoffPending is true a placeholder ("正在带入…") renders instead, so IntakeForm is NOT mounted yet. app/m4/page.tsx:268-303: the handoff effect waits on `if (userLoading) return;` (273) without clearing pending, then for logged-in users queries m3_resumes by `conversation_id=fromM3` (281-284, the join is correct: m3/result/page.tsx:2838 builds the link via `convQs.replace("?c=","?fromm3=")`, and lib/sync/useM3DBSync.ts:41 sets `convQs=\"?c=\"+convId` = the m3 conversation id), sets handoff (292-297) and only then `setHandoffPending(false)` (298). Because IntakeForm is unmounted until pending clears, its `useState(initialRole)` / `useState(initialJd)` (app/m4/page.tsx:557-558) freeze AFTER handoff is populated into prefillRole/prefillJd (317-322) — so the type-2 frozen-initial-state failure is genuinely avoided. At app/m4/page.tsx:572-574 `savedParsed = handoffParsed ?? latestResume.parsedResume`: when handoff resolved, handoffParsed is set so latestResume is never used; latestResume is only the fallback on direct entry (no fromm3), which is the legitimately correct behavior (gap-analysis on the account's current resume). The only theoretical mis-bind (fromm3 row exists but parsed_resume_json is null → falls through to latestResume) is not reachable in practice because the ?fromm3= CTA only appears inside m3/result after the user is working on that conversation's parsed resume (so that row's parsed_resume_json is populated), and in the common single-resume account it would resolve to the same resume regardless.

**4. m5 配置页 latestResume —— fromm3 / m3Loaded 门控正确,目标正确(ok)**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/app/m5/page.tsx:157 (hook); 288-307 (应用 latestResume)`  
app/m5/page.tsx 的三重门控经逐帧推演成立,且不存在类②冻结-useState 问题:

1) 类②不适用于 JD:jdText 用 useState(SAMPLE_JD)(line 171)初值是静态常量,不是异步晚到值;所有异步预填(fromm3 line 223、M6 line 257、JD_CONTEXT line 278)都走 setJdText(...) 即 setState 注入,而非冻结 initial。这正是②类的正确写法,不会丢。savedResumeText 同理:初值 ""(line 161),两条路径都用 setSavedResumeText 注入并响应式消费(line 293/214),无冻结。

2) latestResume 覆盖门控时序无窗口可钻:
   - 门控 effect deps=[latestResume, m3Loaded](line 307)。fromm3 期间 m3Loaded==='pending',effect 每次重跑都在 line 291 `if (m3Loaded === 'pending') return;` 提前返回,从挂载到 fromm3 的 .then() 完成的整个窗口内都不会写 latestResume。
   - fromm3 的 .then()(line 201-227)在同一同步块里先 `m3ResumeAppliedRef.current = true`(line 219)再 `setM3Loaded('done')`(line 226)。当 m3Loaded 翻 done 触发 effect 重跑时,ref 已为 true,line 292 `if (m3ResumeAppliedRef.current) return;` 命中,latestResume 不覆盖。ref 先于触发重渲染的 setState 赋值,无竞态窗口。
   - latestResume.loading 期间另有 line 290 提前返回兜底。

3) 两个 JD effect 互斥:全局 JD effect line 239 `if (fromM3) return;`;fromm3 effect line 189 `if (!fromM3) return;`。不会互相覆盖。

4) fromm3 简历过短(txt≤20)时 ref 不置 true(line 212 门内),门控合理回退到账号最新简历——这是 finder 也认可的合理兜底,非串简历。

结论:finder 的「ok」自评准确;『特定上下文被账号最新简历静默覆盖』在此页确实被三重门控防住。

**5. m6/discover latestResume 驱动岗位推荐匹配 —— 目标正确(ok)**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/app/m6/discover/page.tsx:90 (hook); 94 (parsedResume = uploadedResume ?? latestResume.parsedResume)`  
app/m6/discover/page.tsx:90 `const latestResume = useLatestResume();` and :94 `const parsedResume = (uploadedResume ?? latestResume.parsedResume) as ... ParsedResume | null;` — the recommend flow (runMatchResume, :237-289, POSTs {parsedResume} to /api/m6/match-resume) matches jobs against the account's CURRENT resume, which is exactly the intended semantics for a job-discovery entry. This page is the ORIGIN of the flow, not a destination: it does NOT consume any ?fromm3=, parsed_resume, or jd_context envelope that would carry a specific-resume+specific-JD context needing preservation, so 'take latest' (useLatestResume.ts:101-131, m3_resumes order updated_at desc limit 1) cannot silently mis-wire anything — there is no other context to mis-wire to. In-place uploadedResume correctly takes priority (:94, :95-99). No type-② frozen-useState defect: parsedResume is derived fresh from the reactive hook return on every render (:94), not captured into a frozen useState(initial); uploadedResume is useState(null) by design (filled by user action handleInlineResume, not by a late async prefill). The code is even stricter than 'take latest' — it tracks the resume content signature (:100-105 currentSig, :321 setRecommendSig) and raises a non-destructive stale notice when the resume content drifts (:188-195), so recommendations built on an old resume are never silently presented as current.

**6. m6/discover resolveM3Conv 内联『取最新会话』决定 handoff 落哪条 m3 会话 —— SUSPECT:JD 与简历会话可能错配**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/app/m6/discover/page.tsx:353-369 (resolveM3Conv); 371-388 (handleOptimizeResume)`  
疑点的核心假设(「M6_PENDING_JD 只覆盖表单,fallback 短 JD 不覆盖该会话已存的 jd_context_json,于是新岗位优化挂在带旧 JD 的会话上」)在运行时不成立。关键在 /m3/jd 的数据流:M6_PENDING_JD 不是直接写 jd_context_json,它只预填表单 state(app/m3/jd/page.tsx:128-135,full 走 setJdText,短文走 setMode("role")+setRoleName)。jd_context_json 唯一的写入点是 handleSubmit → setJdContext(enriched)(page.tsx:233,setJdContext 内 saveField("jd_context_json", jd) line 93-96),而用户必须点"继续做匹配"按钮(line 495 onClick=handleSubmit)才会触发,该按钮无论 full 还是 role 模式都会调 /api/m3/parse-jd 重新解析并【无条件覆盖】jd_context_json——role 模式也照样覆盖,且显式写 raw_jd_text=岗位名 fallback 文本 + placeholder_mode:true(page.tsx:220-233)。下游 result 页读的是覆盖后的 jd_context_json(app/m3/result/page.tsx:159)。更关键:进入下一阶段的 handleNextPhase 按钮(line 638)整段被 {result && (...)}(line 508)包住,result 只在 handleSubmit 成功后 setResult(enriched)(line 234)才置位——即没提交就根本看不到"下一步",无法带着旧 JD 往下走。因此疑点担心的「半新半旧 JD」窗口不存在:旧 jd_context_json 必定在用户离开 jd 页前被本岗位的新解析覆盖。疑点对 jd/page.tsx:128 的 length>50 门槛的解读也有误——该门槛只决定表单进 full 还是 role 模式,两条路最终都经 handleSubmit 覆盖 DB,没有"<=50 就留旧 JD"的分支。另外 M6_PENDING_JD 的预填用的是 useEffect 内调 setter(line 114-147)而非冻结的 useState 初值,且 localStorage 在 m6 router.push 前已同步写入(discover/page.tsx:347 在 376 push 前),不存在②类异步晚到丢预填的问题。resolveM3Conv「取最新简历会话」(discover/page.tsx:357-364)确实是①类"取最新"模式,但它只影响落到哪条会话(简历层面),而 JD 每次都被本岗位重解析覆盖,所以不会产生疑点描述的"简历最新份+JD 半新半旧"错配。

**7. 审计结论:全部 31 个 route 的 maxDuration 都存在且 ≥60 — 无 maxDuration 缺失/过短 suspect**  
`app/api/**/route.ts (31 个):各 route 顶部 export const maxDuration`  
Enumerated all 38 route.ts under app/api and cross-checked maxDuration vs chat() usage. Every route invoking chat() has maxDuration>=60: all m1/m2/m3/m4/m5 LLM routes + buer/chat,diary-chat,summarize-diary + chat + tracker/diagnose = 60; m6/match-resume=90 (intentional, multi-agent). Adversarial scan: `for f in $(grep -rlE "chat\(" app/api --include=route.ts); do md=...; if [ -z "$md" ] || [ "$md" -lt 60 ]; then echo BAD; fi; done` printed zero BAD lines. The only routes with MISSING maxDuration are non-LLM: app/api/auth/callback (supabase exchangeCodeForSession), app/api/m3/export-docx (buildDocx, local), app/api/m3/finalize-resume (no LLM/fetch, just json), app/api/m5/asr-token & app/api/m5/tts (Volc voice APIs, not chat()). None of these call chat(), so the maxDuration<60 silent-degradation class does not apply. The suspect is a NEGATIVE finding ("maxDuration 维度全部合格,本类无 suspect") and it is correct; the listed 31 values match the actual files. Note: suspect undercounted total routes (38 vs 31) by excluding non-LLM routes, but that does not introduce a defect since those routes have no chat() call needing maxDuration.

**8. SUSPECT: m3/match-keywords 关键词数量无上限 @ max_tokens=2500,长关键词列表会截断 → 502**  
`app/api/m3/match-keywords/route.ts:43-46(jdKeywords 无 cap)/63-78(chat 2500 + 502)`  
① 上游产出量被双重夹住:app/api/m3/parse-jd/route.ts:238-239 prompt 明示「不硬凑数量…通常 8~25 个,宁缺毋滥」+ temperature 0(L256),且抽取本身 max_tokens=800(L256)物理封顶,实际 jdKeywords 落在 8~25、极端 ~30,而非 finder 说的「20-40+」。② match-keywords 输出 token 估算:每条 {"keyword","hit","evidence"} 即便 evidence 为整句中文也约 40-75 token/条;25 条 ≈ 1875 token,2500(app/api/m3/match-keywords/route.ts:68)有余量,溢出需 ~33+ 条且条条命中带长 evidence——超出上游可产出分布。③ 即使真截断走 502(match-keywords/route.ts:73-76),调用方 app/m3/result/page.tsx:893-917 对 !res.ok 做 3 次指数退避重试,全失败后 setLlmKwResults([]) 静默退回子串保底(同超时路径),无用户可见 502。finder 自述「本该带:至少有用户可见的 502」与代码事实相反(L915-917 有 graceful fallback)。结论:触发条件处于极端长尾且被上游 800-token+「8~25」双重压制,触发后也无错误/无数据损坏,仅关键词卡退化为子串命中(L889 注释 17/18→7/18),看似「匹配差」而非可复现的用户路径 bug。

**9. WATCH(次级): m1/recommend 6-10 条 positive(带 why_fit prose)+ negative + 富 rationale @ 3500 偏紧**  
`app/api/m1/recommend/route.ts:551-577(chat 3500 + 502)`  
app/api/m1/recommend/route.ts:563 `max_tokens: 3500` + jsonMode:true。实际 prompt 要求(line 110/198)是 positive 6-10 条、negative 3 条、refine_chips 4-6 个、rationale 7-8 子字段。把这些算成中文 JSON 输出:10 条 positive(industry/role_type/why_fit 整句/match/match_percentage,即便 needs_project 的双引用 why_fit 也就 ~60-80 token/条)≈600-800 token + negative ~90 + chips ~30 + rationale(几句话+cautions 数组)~300-500,合计约 1000-1400 token,远低于 3500;即便取最啰嗦上界也 <2500。line 562 注释「25 个 positive ≈2500 tokens」是过时/错误的(prompt 根本不要 25 条),但 3500 对真实 6-10 条需求仍绰绰有余,正常路径不会截断。且 truncation 真发生时:app/api/m1/recommend/route.ts:574-582 `JSON.parse` 失败走 `return NextResponse.json({ error:"LLM 返回格式异常,请重试", raw }, {status:502})` —— 用户可见、可重试、无数据错配、无简历串接。maxDuration=60 已正确设置(line 40),不存在线上静默超时。属于「正确兜底」模式,非 bug。

**10. 已确认安全(非 suspect):大输出但已正确护栏的 route**  
`app/api/m3/parse-resume/route.ts; app/api/m3/interview-prep/route.ts; app/api/m3/suggest-edits/route.ts; app/api/m3/excavate/route.ts; app/api/m4/recommend/route.ts; app/api/tracker/diagnose/route.ts; app/api/m3/mine-from-diary/route.ts:parse-resume:305(8000); interview-prep:136(8000); suggest-edits:436(8000+rescueEdits); excavate:336(reasoner2000+空兜底); m4/recommend:298/322(3000/4000,1-2项,502); tracker/diagnose:297(1200,fallbackDiagnosis 降级); mine-from-diary:180(2500,502)`  
All 7 routes verified as correctly guarded for class ③ (maxDuration / max_tokens / large-output truncation):
- app/api/m3/parse-resume/route.ts:30 maxDuration=60; :305 max_tokens 8000 (comment: anti-truncation); :311-318 JSON.parse wrapped, parse-fail returns 502 "LLM 返回格式异常,请重试" (honest, not silent).
- app/api/m3/interview-prep/route.ts:17 maxDuration=60; :136 max_tokens 8000; :141-145 parse-fail → 502 retry.
- app/api/m3/suggest-edits/route.ts:53 maxDuration=60; per-section fan-out (BULLET_SECTIONS :390) each at 8000 (:436), rescueEdits() truncation-salvage (:327-385) scanning balanced braces to recover complete edit objects, per-bucket try/catch returning [] (:444-447) — never 502, never throws. Positive paradigm.
- app/api/m3/excavate/route.ts:30 maxDuration=60; finalize reasoner max_tokens 2000 (:336); parse-fail returns a non-error fallback object {skeptical_flags_by_topic:{}, summary:"…可继续到 Phase 5", _parse_error:true} (:340-347) — graceful, downstream consumes empty safely.
- app/api/m4/recommend/route.ts:35 maxDuration=60; sprint 3000 (:298) / project 4000 (:322); parse-fail → 502 "返回格式异常,请重试" (:305,:329) and empty-array → 502 (:311,:337) — honest retry, no corruption.
- app/api/tracker/diagnose/route.ts:264 maxDuration=60; max_tokens 1200 (:297); parse-fail (:306-308) falls through to fallbackDiagnosis() rule-based degradation with a caution banner (:241).
- app/api/m3/mine-from-diary/route.ts:21 maxDuration=60; chatVision max_tokens 2500 (:180); parse-fail → 502 retry (:187-192) + Array.isArray guard on candidates (:196). chatVision is within class ③ scope and equally guarded.
No route has maxDuration<60 or missing; no JSON.parse is unguarded; no parse error is swallowed into silently-wrong data. Truncation degrades to an explicit retry message, not a data error. Finder's "already safe / non-suspect" record is accurate.

**11. m4 ?fromm3 handoff 查询 .then 无 .catch → DB reject 时 handoffPending 永挂,表单卡在 loading**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/app/m4/page.tsx:280-303`  
page.tsx:285-299 的 `.maybeSingle().then(({data})=>{...; setHandoffPending(false)})` 确实没有 .catch,且 setHandoffPending(false) 只在 onfulfilled 回调里。422 行 `handoffPending ? <loading> : <form>` 确实门控整个表单。BUT 该 query 未调 .throwOnError(),shouldThrowOnError=false。node_modules/@supabase/postgrest-js@2.107.0/src/PostgrestBuilder.ts:369-435:当 shouldThrowOnError 为 false 时,builder 自挂 `res = res.catch(fetchError => ({ success:false, error:{...}, data:null, status:0, ... }))`,把【所有】fetch 拒绝(AbortError 401/ABORT_ERR 见 329-330+401-408、DNS/网络失败、undici HeadersOverflow 410-419、TLS 等)统统转成 resolved 对象。再经 444 行 `.then(onfulfilled, onrejected)` 传给应用 — 即网络失败时也走 onfulfilled,data=null,命中 page.tsx:287 的 `if(data)` false 分支,直达 298 行 setHandoffPending(false)。因此该 .then 在网络/abort 失败时不会 reject,handoffPending 必被置 false,表单必渲染。疑似报告的前提「网络中断/abort 会 reject → 回调不跑」与 postgrest-js 实现相反,故 bug 不成立。

**12. m5 setup 页 ?fromm3 查询 .then 无 .catch → reject 时 m3Loaded 永 pending,简历选择 effect 永被门控**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/app/m5/page.tsx:196-227`  
核心反驳点在 @supabase/postgrest-js@2.107.0 的 promise 语义,而非 m5/page.tsx 本身。
1) app/m5/page.tsx:196-227 的查询用默认配置(未调用 .throwOnError())。
2) node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:80 `protected shouldThrowOnError = false`(默认 false)。
3) 同文件 then() 实现 PostgrestBuilder.ts:369-435:`if (!this.shouldThrowOnError) { res = res.catch((fetchError) => { ... return { success:false, error:{...}, data:null, status:0 } }) }` —— 即所有 fetch 失败(网络错误、DNS、甚至 AbortError 见 line 401)都被内部 catch 吞掉,转成一个【resolved】的 {data:null} 值,而不是 reject。
4) 因此 m5/page.tsx:201 的 `.then(({data})=>{ if(data){...}; setM3Loaded('done') })` 回调【一定会执行】,`if (data)` 因 data===null 被跳过,line 226 `setM3Loaded('done')` 【总会跑到】。门控 effect(page.tsx:291 `if (m3Loaded === 'pending') return;`)随即解除,latestResume 兜底简历正常填入。
5) 唯一理论上能跳过 226 的是回调体在到达 226 前同步抛错(line 204 resumeTextFrom),但它在 `if(data)` 内、仅 data 存在时执行,且 lib/resume-text.ts:18-103 全程类型守卫+s()强转,无抛错路径。这与 finder 所述的 "reject" 机制无关。
结论:finder 的前提("查询 reject → setM3Loaded 永不 done")在该 Supabase 版本下不成立,promise 永不 reject,门控不会卡死。

**13. m1/result handleGoToM4:DB update target_role 失败被 catch{} 吞,无反馈(可接受但记录)**  
`/Users/hyc/Documents/Project/AI-HR/oc-web-a/app/m1/result/page.tsx:153-162`  
该 DB 写是「只写不读」的死数据,因此被 catch 吞掉的写失败没有任何可观测后果。证据:`grep -rn "target_role_json" app lib` 全仓只有一处命中,即写入点 app/m1/result/page.tsx:158 `.update({ target_role_json: role })`,零处读取。M4 消费 target_role 的唯一来源是 localStorage,见 app/m4/page.tsx:249 `window.localStorage.getItem(STORAGE_KEYS.M1_TARGET_ROLE)` → m1TargetRole,并在 app/m4/page.tsx:319 `m1TargetRole?.role_type` 参与 prefillRole。M4 没有任何从 m1_assessments 读 target_role_json 的回退分支(grep 已证)。因此:① 同会话跳转:handleGoToM4 在 page.tsx:150 先写 localStorage 再做 DB 写,localStorage 一定成功,跳转预填正常;② 疑点声称的「跨设备 M4 拿不到 target_role」——M4 跨设备/任何设备都从不读这个 DB 列,所以无论写成功与否结果都一样(都靠 localStorage),DB 写失败不改变任何行为。疑点的根因假设(存在一条读 target_role_json 的跨设备路径会因写失败而拿到空)在运行时不成立。M4 的 m1TargetRole 读取本身用 useState(null)+useEffect 从同步 localStorage 读,且 prefillRole 在 render 期计算,effect 触发重渲染,不存在②类冻结。

