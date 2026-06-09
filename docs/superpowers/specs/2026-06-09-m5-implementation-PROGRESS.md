# m5 v5 实施进度报告（通宵自主开发）

- 日期：2026-06-09
- worktree：`/Users/hyc/Documents/Project/AI-HR/oc-m5-mock-interview`
- 分支：`feat/m5-mock-interview`（**未 merge、未 push**，等你 review）
- 依据：[2026-06-08-m5-mock-interview-upgrade-design.md](./2026-06-08-m5-mock-interview-upgrade-design.md) v5
- 范围策略（你定的）：干净核心做扎实优先；§5 状态机只实现+单测、语音集成留你手测；遇模糊自行判断并记录。

---

## 一、总体状态

| | 状态 |
|---|---|
| build (`npm run build`) | ✅ 绿 |
| 单测 (`npm run test`) | ✅ **61/61 通过**（5 个测试文件） |
| lint (`npm run lint`) | ✅ 我的改动**零新增**（总数仍 113，与基线完全一致，均为既有问题） |
| dev 启动冒烟 | ✅ `/m5` `/m5/live` `/m5/debrief` → 200；`/api/m5/follow-up` GET → 405（POST-only 正确） |
| 提交 | ✅ 每步 1 commit，增量可回退（见下） |
| 破坏性操作 | ❌ 未 merge / 未 push / 未删 worktree / 未对线上 DB 执行 migration |

**核心不变量守住**：所有新机制都是 additive + 失败回退；关掉后 m5 等价于今天。现有 4 维评分、语音链路、highlights→简历回填、scrub、skip/N-A 全未动。

---

## 二、已完成（提交历史）

| 步 | commit | 内容 |
|---|---|---|
| S1 | `18799fc` | 类型扩展(全 additive 可选) + 3 个 m5 路由补 `maxDuration=60`（**顺带修了 debrief 现存超时隐患**） |
| S2 | `0d3ce64` | 岗位方法论库 `lib/m5/methodology/`（bq/backend/generic-tech，能力维度带 strongIndicator，backend 关键词中英双覆盖）+ registry 分流打分兜底 + context 装配 + 单测 |
| S3 | `cd6f83f` | prep-questions 注入方法论 + 每题 `digHint`（A1 简历弱点驱动）+ 加载失败回退 TYPE_SPECS + 返回 methodology_id |
| S4 | `ec586a1` | follow-up 路由（门+生成，**钉死 V3.1**）+ verify 纯函数门 + 客户端预门/预算 + 单测 |
| S5 | `024c2eb` | trace 可观测性 `lib/m5/trace.ts` + migration `004_m5_llm_traces.sql` + prep/follow-up/debrief 经 `after()` 接 recordTrace + 容错单测 |
| S6 | `18a7cc9` | capability 独立路由（**R1**，selectMethodology 确定性再算）+ debrief 页二次懒加载 + fallback-safe 能力雷达区块 |
| S7 | (已提交) | live 状态机**纯函数核** `lib/m5/live-machine.ts`（B1 幂等/G2 去重/thinking 推进/rehydrate）+ 单测 |

新增文件：`lib/m5/{methodology/specs.ts,methodology/registry.ts,context.ts,follow-up.ts,verify.ts,trace.ts,live-machine.ts}` + 各 `*.test.ts`；`app/api/m5/{follow-up,capability}/route.ts`；`supabase/migrations/004_m5_llm_traces.sql`；`vitest.config.mts`。

---

## 三、需要你做的事（按优先级）

### ✅ 1. live/page.tsx 动态追问接线 —— 已完成（commit S7b），**仍需真麦克风手测一场**
已把 live-machine 纯函数接进 reducer：USER_ANSWER_DONE→thinking 挂起、RESOLVE_FOLLOWUP(B1 守卫+插入/推进)、follow-up effect(12s abort/暂停重试)、evaluate-turn G2 在途去重、methodology_id 透传、"面试官思考中…"提示。**决策**：未改 TTS/ASR 的 index 去重（C3 降级为非必须，只向后插入不会错乱，降低改坏语音风险）。build/lint/test/dev 200 全过。
**手测重点**：答完→"面试官思考中…"→追问紧接母题被念出 / 或进下一题；追问与回答相关；暂停时追问返回不乱跳；插入追问后总题数增长正常。

—— 以下为原配方（已实施，留作参考）：

1. **import**：`lib/m5/live-machine`（enterThinking/resolveFollowUp/isStaleResolve/advanceToNext/shouldStartEvaluate/serialize+deserializeLiveState/hasResumableProgress）+ `lib/m5/follow-up`（shouldRequestFollowUp/computeFollowUpBudget）。
2. **reducer 加 state**：`followUpsUsed`（已在 live-machine 的 AdvanceState 体现）。
3. **`USER_ANSWER_DONE`（约 live:134-164）拆两段**：① 记录答案 + `enterThinking`（**不推进 index**）；② follow-up 决议后用 `resolveFollowUp` 推进/插入。
4. **follow-up 流程（新 effect）**：status===thinking 且非 skip 且 `shouldRequestFollowUp(...)` → fetch `/api/m5/follow-up`（带 `AbortController` **10-12s** 超时；body 传 main_question/answer_transcript/filler_count/methodology_id/persona/follow_ups_used/follow_up_budget/asked_texts/session_id）。**resolve 时先过 `isStaleResolve` 幂等守卫**（B1：暂停/结束/过期 → 丢弃），否则 dispatch 一个 RESOLVE_FOLLOWUP action（内部调 resolveFollowUp）。失败/超时/预算耗尽 → `advanceToNext`。
5. **ID 化去重（B4）**：把 `ttsPlayedForIdx`/`asrStartedForIdx` 从整数 index 改为按 `question.id`（Set 或 ref<Record<id,bool>>）；**同时改"重复问题"按钮的复位**（约 live:1207，现为 `ttsPlayedForIdx.current=null`，改成按当前题 id 复位）。
6. **evaluate-turn 在途去重（G2）**：加 `inflightEvalIds` ref（Set），发请求前用 `shouldStartEvaluate(id, evaluatedIds, inflightIds)`；请求结束从 inflight 删除。（现有 effect 依赖 `state.questions`，follow-up insert 会重跑 → 不加会对同一答案重复打分。）
7. **thinking UI**：thinking 态显示"面试官思考中…"。
8. **v5-R1 增量持久化**：每答完一题/进 thinking → `serializeLiveState(...)` 写 localStorage（key 如 `m5_live_progress`）；登录用户把现有 `m5_interviews.turns_json` 写入**移出 `finished` 门**（live:631）、改增量 upsert。**mount 时**检测 localStorage 进度 + `hasResumableProgress` → 弹"继续上次面试" → `deserializeLiveState` 后 REHYDRATE。

> 风险点：reducer 是唯一非纯函数硬改。建议接好后**本地用麦克风跑一整场**，重点验证：追问紧接母题出现、TTS/ASR 不重复不漏、暂停时追问返回不乱跳（B1）、刷新后能"继续上次"。两条 race（follow-up 先于 evaluate 返回 / thinking 态暂停后 follow-up 迟到）的逻辑已被 live-machine 单测覆盖。

### 🟡 2. capability 能力雷达 UI 视觉确认
debrief 页能力区块逻辑/编译已过，但**渲染样式没法自动验证**。跑一场答完→看复盘页：4 维秒出 + 下方"岗位能力维度"区块懒加载后填（R1 ~30-50s）。失败会静默不显示（不影响 4 维）。

### 🟡 3. 上线前执行 migration（trace 表）
`supabase/migrations/004_m5_llm_traces.sql` **我没对线上执行**。上线前在 Supabase 跑一次。trace 是 fire-and-forget，表没建也不影响主流程（只是没 trace 数据）。需要 `SUPABASE_SECRET_KEY` 环境变量（createAdminClient 用）。

---

## 四、我做的决策（自行判断项，供你复核）

1. **引入 vitest 作隔离 devDep**：项目原无测试框架，但设计强依赖"纯函数可单测"。worktree 有独立 node_modules（我用 `npm ci` 而非软链——软链会被 Turbopack 拒），故装 vitest 不污染 main。加了 `vitest.config.mts`（@/ 别名）+ `package.json` 的 `test` 脚本。**可保留可移除**。
2. **方法论用 `.ts` 对象而非 .md+frontmatter**（按 v5 R4）：零解析依赖。
3. **能力评分解耦为独立 `/api/m5/capability` 路由 + 客户端懒加载**（按 v5 G1）：debrief 路由不变慢。capability 路由用 `selectMethodology(config)` 确定性再算方法论，**无需客户端透传 methodology_id**（更省接线）。
4. **follow-up 预门 minLen=120 / maxFiller=5 / 需含数字**：门槛保守，只跳过"明显答得好"的题，降低"流利但空洞"误判（单测覆盖）。这些阈值在 `lib/m5/follow-up.ts`，可调。
5. **dedup 相似度阈值 0.6**（中文近义改写字符相似度本就偏低）：抓近似重复；失败仅"丢弃追问"无害。
6. **trace token 用估算**（CJK≈1/字，其余≈1/4）：未改 `lib/llm.ts`（避免动共享文件影响其他模块）；要精确 token 可后续让 chat() 返回 usage。
7. **follow-up budget = round(N×0.6)**：5→3/10→6/15→9。

---

## 五、怎么验证 / 怎么合并

```bash
cd /Users/hyc/Documents/Project/AI-HR/oc-m5-mock-interview
npm run test     # 61/61
npm run build    # 绿
npm run dev      # 起来后手动跑一场（接好 §三-1 后才有动态追问）
```

确认满意后合并（你的 worktree 工作流：先验证→再合并）：
```bash
git -C /Users/hyc/Documents/Project/AI-HR/offer-catcher-web merge feat/m5-mock-interview
# push + 删 worktree 由你决定
```

> 注：`docs/superpowers/specs/` 的设计文档已在 S0 提交到 main（d229382）。

---

## 六、还没做（明确不在本次范围）
- live/page.tsx 实际语音接线（§三-1，留你手测）。
- 能力雷达可换成真 SVG 雷达图（现是分维度卡片 + ScoreBar，功能等价、更稳）。
- trace 看板 / 评分 eval 校准（v5 之后路线图 §11，eval 是下一步最该做的生产级门槛）。
