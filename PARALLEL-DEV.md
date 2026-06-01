# 「Offer 捕手」并行开发分块文档

> **给并行开发的 Claude(或其他 agent)**:你被分配开发其中一个模块。这份文档让你不读全 plan 也能干活。**先读这份文档第 0、1、2、3 节,再读你被分到的模块章节,然后开干。**

---

## 0. 干活前必读

### 0.1 项目背景(30 秒)

- 名字:**「Offer 捕手」** — 学生求职 AI 助手,11-14.5 天交付的比赛项目
- 5 维评分:思辨深度 / 创意巧思 / 功能完整度 / 交互体验 / 落地可行性
- 5 大模块:**测评 → 经历挖掘 → 简历整理 → 项目设计 → 模拟面试**(+ 不二陪伴 + 双向闭环)
- 技术栈:Next.js 16.2.6 (App Router, Turbopack) + React 19 + Tailwind 4 + shadcn/ui + DeepSeek API
- 部署:Vercel + GitHub (`git@github.com:yuchensust-design/AI-HR.git`)

### 0.2 必读文件(按顺序)

| # | 文件 | 读什么 |
|---|---|---|
| 1 | `/Users/hyc/Documents/Project/AI-HR/PM产出物/03-产品PRD.md` | 你模块对应的 §3.X 章节 |
| 2 | `/Users/hyc/.claude/plans/b-sop-skill-superpower-skill-skill-skil-luminous-dove.md` | 你模块的"决议"段(§8.X,本文档每个模块标了具体段号) |
| 3 | 本文档 §4 你被分到的模块 | 怎么做,要碰哪些文件 |
| 4 | `offer-catcher-web/AGENTS.md` | **Next.js 16 重大变化警告**,写代码前必读 |
| 5 | `offer-catcher-web/lib/llm.ts` | DeepSeek 调用 helper(已封装 `chat()`),复用别重写 |
| 6 | `offer-catcher-web/lib/use-local-state.ts` | localStorage hook 和 `STORAGE_KEYS` 常量,**所有数据落 localStorage 都用这个** |

### 0.3 硬约束(违反 = 直接退回)

| # | 约束 | 适用模块 |
|---|---|---|
| 1 | **永远不输出公司名**(只到"行业 + 职位类型") | 所有模块 |
| 2 | **游客模式**(v1 全 localStorage,不进后端 DB) | 所有模块 |
| 3 | **DeepSeek API**(不引第三方 LLM SDK,统一 `lib/llm.ts`) | 所有模块 |
| 4 | **不二要 esther 风格**(蓝 #2B7FD8 / 黄 #F4D758 / 红 #E84A5F + Noto Serif SC 标题 + Fraunces italic) | 所有 UI |
| 5 | **零打字承诺**(测评全选择题,不开自填) | m1 |
| 6 | **不要 commit `.env.local`**(已在 .gitignore) | 所有 |
| 7 | **JSON mode prompt 必须明示"返 JSON"**(否则 DeepSeek 报错) | 任何用 LLM 出 JSON 的 |

### 0.4 第一性原理 + 站在巨人肩膀上(强制方法论)

**写代码前 30 分钟先调研:你这模块的功能,有没有现成的 skill prompt / 开源 npm / 公开数据 已经做了 80%?**

1. **优先复用 `lib/prompts/`** — 3 个 skill 完整 prompt 已搬入仓:
   - `skill-matching.md` + refs/(5-phase 简历整理)— 模块 B 用
   - `skill-excavating.md` + refs/(6-phase 经历挖掘)— 模块 E.1 用,模块 C 行为面追问参考
   - `skill-designing-bridge.md` + refs/(5-phase 项目设计)— 模块 E.2 用
   - **写 system prompt 时 fs.readFile 嵌入对应 .md 段,不要重新设计 phase 流程**
2. **优先 MIT/Apache/BSD license npm 包** — 已知好用的:
   - `pdfjs-dist`(Apache 2.0)PDF → text(client-side)
   - `mammoth`(BSD-2)Word → text(client-side)
   - `docx`(MIT)markdown → .docx 生成(server-side)
   - `react-markdown`(MIT)markdown → HTML 渲染
   - `recharts`(MIT)dashboard 图表
3. **AGPL 项目仅可视觉/UX 参考,不能 fork 代码**(病毒条款污染本项目)
   - OpenResume / resume-lm:看 UI 设计思路,不抄代码
4. **WebSearch 兜底**:模糊的方向都先 WebSearch 一次,看 GitHub 有没有同类 skill / repo

**Anti-pattern**:
- ❌ 自己重新设计 5 phase 流程(prompt 已有)
- ❌ 自写 PDF/Word parser(npm 已有)
- ❌ 自写 docx 序列化(npm 已有)
- ❌ "我觉得 prompt 这样写更好"(skill .md 是 4 轮 review 稳定版,只能在 plan §X.X lock 的修改方向上 override)
- ❌ 不调研就开干

### 0.5 4 套思辨纪律(模块开发时要内化进 prompt)

- **Skeptical Recruiter**:关键产出前 AI 扮演怀疑 HR 提 3 weak spot
- **Anti-fabrication**:项目未完成不能加简历 / 不替用户编故事
- **Gap → Project 桥接**:经历缺口自动转项目建议
- **反 rationalization 表**:AI 不让步于"我想看起来更好"压力

每个模块的 prompt 设计要内化对应纪律(每模块章节会说"应该内化哪几条")。

---

## 1. 模块拓扑 + 优先级

```
┌─────────────────────────────────────────────────────────────────┐
│ Landing (✅ v4 完成) → 6 persona 选 → 跳到推荐模块入口         │
└─────────────────────────────────────────────────────────────────┘
              │
              ↓
    ┌─────────────────┐
    │ 模块 1 测评     │ ⚠️ 用户反馈不准 → 模块 A (本文档,优先!)
    │ (✅ 部署,待修) │
    └─────────────────┘
              │  推方向
              ↓
    ┌─────────────────┐         ┌─────────────────┐
    │ 模块 3 简历整理 │ ←─闭环──│ 模块 5 模拟面试 │
    │ (P0,模块 B)   │ ─────────│ (P0,模块 C)   │
    └─────────────────┘  反哺   └─────────────────┘
              ↑                       ↑
              │                       │
    ┌─────────────────┐         ┌─────────────────┐
    │ 模块 2 经历挖掘 │         │ 模块 4 项目设计 │
    │ (P1,模块 E.1) │         │ (P1,模块 E.2) │
    └─────────────────┘         └─────────────────┘
              │
              ↓ 整个 app 右下角悬浮
    ┌─────────────────┐
    │ 不二陪伴 (P1)  │ ── 模块 E.3
    └─────────────────┘
```

| 优先级 | 模块代号 | 模块 | 估时 | 阻塞 |
|---|---|---|---|---|
| **P0 最优先** | **A** | 测评修改(m1) | 1-2h(看用户具体反馈) | 无 |
| **P0** | **B** | 模块 3 简历整理 5-phase | 2.5 天 | 无 |
| **P0** | **C** | 模块 5 模拟面试 | 3 天(含 TTS 集成 + ASR 2.0 自实现) | 火山 ASR Secret Key 用户给完 |
| **P0** | **D** | 双向闭环(m5 ↔ m3) | 0.6 天 | B + C 都完成 |
| **P1** | **E.1** | m2 经历挖掘 | 0.5 天 | 无 |
| **P1** | **E.2** | m4 项目设计 + mentor 学习卡组 | 1.5 天 | 无 |
| **P1** | **E.3** | 不二陪伴(BuerFloatingButton panel 实化) | 0.5 天 | 无 |
| **P1** | **E.4** | 后台 dashboard(密码访问) | 0.5 天 | 无(独立) |
| **最后** | **F** | 视觉精修 + Demo 视频 + 1000 字方案 | 1-1.5 天 | 所有前置完成 |

**并行可能性**:**A / B / C / E.1 / E.2 / E.3 / E.4 全部可并行**(没有共享数据流冲突)。D 等 B+C。F 等所有。

---

## 2. git worktree 操作指南

### 2.1 概念

`git worktree` 让一个 repo 同时检出多个分支到不同目录,**共用 .git**,**互不干扰**。完美适合并行开发不同模块。

### 2.2 主仓库位置

```
~/Documents/Project/AI-HR/offer-catcher-web/   ← 主 worktree,留给 main 分支
```

### 2.3 创建 worktree(在主仓库下跑)

```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web

# 先确保 main 最新
git fetch origin && git checkout main && git pull

# 给每个模块创建一个 worktree(命名规范:oc-<模块代号>)
git worktree add ../oc-A-quiz-tune     -b feat/A-quiz-tune     main  # 模块 A
git worktree add ../oc-B-resume        -b feat/B-resume        main  # 模块 B
git worktree add ../oc-C-interview     -b feat/C-interview     main  # 模块 C
git worktree add ../oc-E1-experience   -b feat/E1-experience   main  # E.1
git worktree add ../oc-E2-mentor       -b feat/E2-mentor       main  # E.2
git worktree add ../oc-E3-buer         -b feat/E3-buer         main  # E.3
git worktree add ../oc-E4-dashboard    -b feat/E4-dashboard    main  # E.4

# 查看所有 worktree
git worktree list
```

### 2.4 在 worktree 里干活

```bash
cd ~/Documents/Project/AI-HR/oc-B-resume

# 第一次进:装依赖(node_modules 不跨 worktree 共享)
npm install

# 拷 .env.local(.env.local 不进 git,要手动从主 worktree 拷)
cp ~/Documents/Project/AI-HR/offer-catcher-web/.env.local .env.local

# 跑 dev,**用不同端口避免冲突**
npm run dev -- -p 3002  # 模块 B 用 3002,见 §2.6 端口表

# 做完一块就 commit + push
git add -A
git commit -m "feat(m3): phase 2 JD parse done"
git push origin feat/B-resume
```

### 2.5 完成后:回主仓库 merge

```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git fetch origin
git merge origin/feat/B-resume   # 或者用 PR 合,看习惯
git push origin main

# worktree 不需要时清理
git worktree remove ../oc-B-resume
```

### 2.6 端口分配(避免 dev 冲突)

| Worktree | 端口 | 命令 |
|---|---|---|
| 主(main) | 3000 | `npm run dev` |
| oc-A-quiz-tune | 3001 | `npm run dev -- -p 3001` |
| oc-B-resume | 3002 | `npm run dev -- -p 3002` |
| oc-C-interview | 3003 | `npm run dev -- -p 3003` |
| oc-E1-experience | 3004 | `npm run dev -- -p 3004` |
| oc-E2-mentor | 3005 | `npm run dev -- -p 3005` |
| oc-E3-buer | 3006 | `npm run dev -- -p 3006` |
| oc-E4-dashboard | 3007 | `npm run dev -- -p 3007` |

---

## 3. 共享文件 lock(防冲突)

**这些文件多个模块都会读,但只允许在 main 分支改;worktree 必须 `git rebase main` 同步**:

| 文件 | 谁能改 | 备注 |
|---|---|---|
| `lib/llm.ts` | 主 worktree 唯一 | DeepSeek wrapper,加新参数也走主 worktree |
| `lib/use-local-state.ts` | 主 worktree 唯一 | localStorage hook |
| `lib/utils.ts` | 主 worktree 唯一 | shadcn cn() helper |
| `app/layout.tsx` | 主 worktree 唯一 | 全局壳 |
| `app/globals.css` | 主 worktree 唯一 | 全局样式 |
| `tailwind.config.ts` | 主 worktree 唯一 | esther tokens |
| `components/ui/*` | 主 worktree 唯一 | shadcn 原始组件,**别改** |
| `components/Nav.tsx` | 主 worktree 唯一 | 顶部 nav,改要看所有页面 |
| `components/BuerFloatingButton.tsx` | **E.3 owner 独占** | 其他 worktree 别动 |
| `components/PersonaSelector.tsx` | 主 worktree 唯一 | Landing 用 |

**协议**:
- 改之前 grep 看有没有其他 worktree 在动(`git log --all --since="1 day ago" -- <file>`)
- 改完立刻 push,通知其他 worktree rebase
- 如果出现冲突 → 在主 worktree resolve,worktree 各自 rebase

**所有 `app/m<N>/` 子目录和 `app/api/m<N>/` 子目录由对应模块 owner 独占**,没有冲突。

---

## 4. 模块分块 detail

---

### 4.A 测评修改(m1 tune)— ⚠️ 用户优先

#### 目标
用户自测后反馈"测评不准"。需要先跟用户确认哪里不准,再针对性改。

#### 优先级 + 估时
- P0 最优先(用户主动提出,趁记忆新鲜)
- 1-2 小时(看问题深度)

#### 当前状态
- ✅ 已部署 Vercel + GitHub(commit `71cebbc`)
- ✅ 18 题 RIASEC + 1 题兴趣已写在 `lib/quiz-data.ts`
- ✅ 三段融合算法跑通,反向 3 + chip 修推荐都工作
- ⚠️ 用户实测后说"很大问题,自己测都感觉不准"

#### PRD 关键章节
- `03-产品PRD.md` §3.1 模块 1(兴趣岗位发现)
- §3.1.4 删除(已删,确认无残留)

#### plan 关键决议
- §B 模块 1 总决议
- §B.5 经历 gating(兴趣 + 经历对齐才推具体方向)
- §8.16 测评-分析闭环算法 lock(本次实装依据)
- **§8.16 §M 验证 checklist** — 没覆盖"主观感受"维度,这是问题源头

#### 已有文件清单
- `lib/quiz-data.ts` — 18 题 + 兴趣 tag + computeRIASEC + computeConfidence
- `lib/career-pool.ts` — 43 个候选职位 + generateCandidates()
- `app/api/m1/recommend/route.ts` — 三段融合 endpoint
- `app/api/m1/refine/route.ts` — chip 修推荐 endpoint
- `app/m1/page.tsx` — entry router
- `app/m1/quiz/page.tsx` — 答题流程
- `app/m1/result/page.tsx` — 结果页

#### 第一步:跟用户确认问题
**不要直接改代码**。先用 `AskUserQuestion` 让用户挑哪类问题:
- 题目选项不够精准(某题里选不到匹配自己的)?
- RIASEC 维度归类有错(某选项标 E 但用户觉得应是 I)?
- 推荐方向跟自我认知差太远?
- confidence 等级展示不直观?
- 反向"消耗"推荐误伤?
- 推荐文案露 backend jargon(eg "data_ai" 英文 tag key)?

#### 可能的改动位置

| 用户反馈 | 改哪里 |
|---|---|
| 某题选项不准 | `lib/quiz-data.ts` 的 RIASEC_QUESTIONS |
| 维度归类错 | 同上,改 dim 字段 |
| 推荐方向差太远 | `app/api/m1/recommend/route.ts` 的 SYSTEM prompt + `lib/career-pool.ts` 的权重 |
| 反向误伤 | `app/api/m1/recommend/route.ts` 的"反向 3 个的判定依据" |
| 文案露 jargon | recommend prompt 加"why_fit 里禁止出现 data_ai / content 等英文 key 名,要中文表达" |
| 维度分布不均 | grep `dim:` 重算,改 quiz-data.ts(目标 ±2 均衡) |

#### 验证 checklist
- `npm run build` 0 错
- 用户重测同一份答案,推荐质量主观感受改善
- 浏览器手动跑一遍 /m1/quiz → /m1/result,确认无回归
- 用 grep 检查无公司名:`curl POST /api/m1/recommend ... | grep -E '阿里|腾讯|字节|...'` 应无输出

#### git worktree
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree add ../oc-A-quiz-tune -b feat/A-quiz-tune main
cd ../oc-A-quiz-tune && npm install && cp ../offer-catcher-web/.env.local . && npm run dev -- -p 3001
```

---

### 4.B 模块 3 简历整理 5-phase(B)

#### 目标
用户的简历从"散乱经历 / JD 错配"变成"基于目标 JD 调整后能直接投递的 Word 文档"。

#### 优先级 + 估时
- P0 核心(plan §8.11 P0 闭环 4 模块之一)
- 2.5 天

#### 当前状态
- ✅ stub page `app/m3/page.tsx` (444 行,hardcoded 陈昊 sample + 5 phase 进度条 + Word 预览 + ASK AI 对话框)
- ⚠️ 完全没接 LLM,全是静态展示
- ✅ 收到 `from=debrief` searchParam → 显示返回 banner(双向闭环来路)

---

#### ⚠️ 第一性原理 + 站在巨人肩膀上(强制)

**不要重新发明轮子**。本模块 95% 的工作 = **复用已有 prompt + 接 3 个开源 npm 包**。

##### 复用 1:已有的 Skill 3 完整 prompt

`offer-catcher-web/lib/prompts/skill-matching.md` 已写好 Skill 3 的:
- Voice / Overview / When to Use / 5-Phase SOP 总览
- Handoff Decision Table
- Common Patterns / Red Flags

`offer-catcher-web/lib/prompts/skill-matching-refs/question-batteries.md` 已写好每 phase 的:
- Phase 1 简历解析 Opener + 解析步骤
- Phase 2 派生候选岗位池 + priority score + 不足分析
- **Phase 3 选择题完整模板**(通用模板 + 字节音乐业务举例)
- Phase 4 时间预算分流(< 1 周突击 / 1-4 周中期 / ≥ 1 月长期)
- Phase 5 综合输出 + 路由

`offer-catcher-web/lib/prompts/skill-matching-refs/multiple-choice-design.md`(166 行)— Phase 3 选择题设计 5 条原则(沾边都算 / 4+1 填空 / 双维度 / 不审判 / follow-up 深挖)。

`offer-catcher-web/lib/prompts/skill-matching-refs/red-flags-and-rationalizations.md` — Anti-fabrication 防偷工减料表。

`offer-catcher-web/lib/prompts/skill-matching-refs/matched-jobs-template.md` — 输出 schema 模板。

**写 API endpoint 的 system prompt 时:直接 cat 这些 .md 文件拼到 prompt 里,不要重新设计 phase 流程**。例:

```typescript
import { promises as fs } from "fs";
import path from "path";

const PROMPT_BASE = path.join(process.cwd(), "lib/prompts/skill-matching-refs");

async function loadQuestionBatteries() {
  return await fs.readFile(
    path.join(PROMPT_BASE, "question-batteries.md"),
    "utf-8"
  );
}

// 在 SYSTEM prompt 里嵌入相应 phase section
```

##### 复用 2:开源 npm 包(MIT/BSD,可商用)

| npm 包 | License | 用途 | 替代什么 |
|---|---|---|---|
| **`pdfjs-dist`** | Apache 2.0 | client-side PDF → text 提取 | 自写 PDF parser(几百行) |
| **`mammoth`** | BSD-2-Clause | client-side Word(.docx) → text 提取 | 自写 docx parser |
| **`docx`** | MIT | server-side markdown/JSON → .docx 生成 | 自写 docx 序列化 |

**这 3 个 npm install 就完事**:
```bash
npm install pdfjs-dist mammoth docx
```

##### 视觉/UX 参考(只看不 fork)

| 项目 | URL | License | 借鉴什么 |
|---|---|---|---|
| **OpenResume** | https://github.com/xitanggg/open-resume | AGPL-3.0(**不能 fork**) | client-side parser 思路 / ATS 检测维度 / 简历模板版式 |
| **resume-lm** | https://github.com/olyaiy/resume-lm | AGPL-3.0(**不能 fork**) | Next.js 15 + React 19 + Tailwind 4(跟我们同栈) wizard 流程设计 |
| **Resume-Matcher** | https://github.com/srbhr/Resume-Matcher | Apache 2.0 | LLM-based 简历 + JD 匹配 prompt 思路 |

**做法**:打开它们网页或 GitHub 仓库,看 UI 截图和 README 描述,**不要 fork 代码**(AGPL 病毒条款会强制本项目也变 AGPL)。Resume-Matcher 可以读 prompt design 学习。

##### Anti-pattern(违反 = 退回)

- ❌ 自己重新设计 5 phase 流程(已经在 lib/prompts 里写好,直接抄)
- ❌ 自写 PDF/Word parser(用 pdfjs-dist + mammoth)
- ❌ 自写 docx 序列化(用 docx npm)
- ❌ Fork AGPL 项目代码(license 污染)
- ❌ "我觉得 prompt 这样写更好"(skill-matching.md 是 4 轮 review 后的稳定版,不要轻易动设计;**只能在 plan §A.1 lock 的修改方向上 override**)

---

#### 🛑 Step 0(阻塞):调研对比 + 整合方案 — 不完成不能开始写代码

**任务**:下面 9 个候选 skill / 仓库都跟"简历优化"相关。**你要逐个调研,评估优劣,写出"采用 / 借鉴 / 不用"的整合方案**,跟用户确认后再开干。

##### 候选清单(必须每个都看一眼)

| # | 名称 | URL | License | 一句话定位 | 已知关键点 |
|---|---|---|---|---|---|
| 1 | **lib/prompts/skill-matching** + refs/ | 已搬入仓 `offer-catcher-web/lib/prompts/skill-matching.md`(79 行) + `skill-matching-refs/*`(480 行) | 项目内 | 我们自己的 Skill 3 — 5 phase 完整 SOP,plan §A.1 lock 的主流程 | 这是**主框架**,不可替换;其他 skill 是补充 |
| 2 | **Echo-Smith/tencent-campus-recruit-generic** | https://github.com/Echo-Smith/tencent-campus-recruit-generic | **MIT** ✅ | 腾讯校招特化 — 提炼自 WorkBuddy 平台,2026-04 更新 | `references/resume-guide.md`(6.7KB,STAR + 6 误区 + 表达优化 + 院校中性) / `interview-prep.md`(11.6KB,模块 C 用) / `job-database.md`(6.4KB) / `scripts/fetch_recruit_jds.py`(抓 join.qq.com,不入 Web) |
| 3 | **wyh0626/resume-optimizer** | https://github.com/wyh0626/resume-optimizer | 待 check | "So what?" 5 步深度审计 + STAR 重写,**校招社招都支持** | 强项是 review 已有简历的"句句质疑",我们 Phase 5 之后做 candidate bullets 优化时可借鉴 |
| 4 | **Paramchoudhary/ResumeSkills**(20 skill 合集) | https://github.com/Paramchoudhary/ResumeSkills | 待 check | 20 个 AI agent skill — resume-bullet-writer / resume-ats-optimizer / resume-section-builder / executive-resume-writer / tech-resume-optimizer 等 | plan 里 §1.2 多次提及作"下游 ResumeSkills";原本设计是 Skill 3 handoff 给其中某个;**重点看 resume-bullet-writer 和 ats-optimizer** |
| 5 | **chen3tu/interview-master-skill** | https://github.com/chen3tu/interview-master-skill | 待 check | 全流程面试准备 + 求职决策系统(中文 Claude Skill) | 主要给模块 C 用,但简历优化可能也有副产物模板 |
| 6 | **liyupi/yupi-skill**(鱼皮 skill) | https://github.com/liyupi/yupi-skill | 待 check | 程序员鱼皮的 agent skill — 编程学习/求职/AI 编程/简历优化/技术选型 | 中文程序员视角,STAR 写法 + 大厂简历评估;考察"是不是会跟我们风格冲突" |
| 7 | **srbhr/Resume-Matcher** | https://github.com/srbhr/Resume-Matcher | **Apache 2.0** ✅ | LLM 简历 + JD 匹配重写,Reader LLM 对比排序 | **可读 prompt**,JD 匹配思路可借鉴(Phase 2),不 fork 代码 |
| 8 | **xitanggg/open-resume** | https://github.com/xitanggg/open-resume | **AGPL-3.0** ❌ 不能 fork | client-side PDF parser(PDF.js) + ATS 检测 + react-pdf 生成 | **只看 UI 设计 + 解析算法思路**,不抄代码;PDF 解析我们用同款 pdfjs-dist |
| 9 | **olyaiy/resume-lm** | https://github.com/olyaiy/resume-lm | **AGPL-3.0** ❌ 不能 fork | Next.js 15 + React 19 + Tailwind(同栈)wizard 流程 + AI tailor | **只看 wizard UX**,跟我们 5 phase 进度条对比借鉴;不 fork |

##### 评估每个时,问这 6 个问题

1. **License 安不安全?**(MIT/Apache/BSD = 可用 / AGPL = 只能视觉参考 / 没标 = 写 README 找作者授权或不用)
2. **内容质量?**(随便看 SKILL.md + README,有没有空洞口号 / 有没有"零编造""不夸大"等纪律)
3. **跟我们 plan §A.1 + §B + §改进 1-8 契合度?**(是不是同一种"不审判 / 院校中性 / Anti-fabrication"风格)
4. **能直接用的部分?**(prompt 文本嵌入 / 算法思路 / 数据库 / npm 包 / UI 模板)
5. **不能用的部分?**(license 冲突 / 风格冲突 / 太特化没意义 / 跟"永远不推公司名"硬约束冲突)
6. **怎么组合?**(主框架 = #1 我们自己的;补充 = 哪几条;舍弃 = 哪几条 + 理由)

##### 输出格式 — 写 `docs/B-skill-research-report.md`

```markdown
# 模块 B 简历优化 skill 调研报告

## 1. 主框架
采用 lib/prompts/skill-matching.md + refs/(理由:...)

## 2. 补充借鉴
- 从 #X 拷 references/Y.md 到 lib/prompts/external/(理由 + 嵌入哪个 endpoint 的 prompt)
- 从 #Z 借鉴算法 thinking(不抄代码)
- ...

## 3. 舍弃
- #N 不用,因为(license / 风格冲突 / 重复)
- ...

## 4. 整合方案
- Phase 1 parse-resume:用主框架 + 嵌入 #X.references.Y 的某段
- Phase 2 parse-jd:用主框架 + 借鉴 #7 (Resume-Matcher) 的 JD 拆解 prompt 思路
- Phase 5 generate-resume:用主框架 + 嵌入 #2 (tencent) resume-guide.md 通用部分(STAR + 误区) + 用户 JD 含腾讯时额外嵌入腾讯特化部分
- ...
```

##### 提交报告后

跟用户确认这份调研报告 → 用户给"go"后才能 begin coding。

**不能跳过**:不调研直接写 = NIH 风险高,最终 prompt 质量低于复用现成 skill。这是用户明确的方法论要求(2026-06-01)。

---

#### PRD 关键章节
- `03-产品PRD.md` §3.3 模块 3(简历整理)
- §3.3.5 5 phase 详述
- §3.3.6 输出 = 1 份整理好的简历(默认),3 个补充产物按需 unlock(改进 1)

#### plan 关键决议(**override skill-matching.md 的 4 处**)
- **§A.1 Skill 3 5 个 Phase 输出 / 交互重构 ★** — 关键!skill-matching.md 写"5 phase 各产出 1 个 .md",但 plan §A.1 lock:
  - Phase 1:产出 `parsed_resume`(localStorage,不存 .md)
  - Phase 2-3:**全部进 localStorage 结构化**(`jd_summary` / `jd_requirements_parsed` / `match_highlights` / `hidden_experience_candidates`),**不存 .md 文件**
  - Phase 4:可选,用户主动询问"按需 unlock" (改进 1)
  - Phase 5:**默认 = 1 份整理好的简历**(.docx + .md),**不再 4 个 artifact**
- §C 公司维度权重低 → JD : 公司 = 80 : 20
- §D.1 PDF 解析:粘贴优先 → 失败明示用户(不瞎猜)→ 引导上传截图(多模态)
- §D.6 简历内容必须含 Phase 2/3 对话挖到的隐藏经验
- §E.1 Word 版式:1 页 / 思源黑体或 fallback / 章节标题 12pt / 正文 10.5pt / 1.2 行距 / 黑白
- §改进 5 **candidate bullets 自动产出**:Phase 5 末尾直接产 3-5 候选 bullet(STAR / X-Y-Z),用户直接 copy
- §8.12 §B.1 中间数据**结构化落 localStorage** 关键字段名:`jd_summary` / `jd_requirements_parsed` / `match_highlights` / `hidden_experience_candidates`

#### 已有文件清单(读这些理解现状)
- `app/m3/page.tsx` — 现有 stub(444 行)
- `lib/prompts/skill-matching.md`(79 行) — Skill 3 SKILL.md(看 5 phase 总览)
- `lib/prompts/skill-matching-refs/question-batteries.md`(189 行) — **每 phase 的精确提问模板**(写 prompt 直接用)
- `lib/prompts/skill-matching-refs/multiple-choice-design.md`(166 行) — Phase 3 选择题设计原则
- `lib/prompts/skill-matching-refs/matched-jobs-template.md`(70 行) — matched-jobs 输出 schema
- `lib/prompts/skill-matching-refs/red-flags-and-rationalizations.md` — Anti-fabrication
- `lib/llm.ts` — DeepSeek wrapper(复用 chat() + jsonMode)
- `lib/use-local-state.ts` — STORAGE_KEYS 已有 PARSED_RESUME / JD_CONTEXT / HIDDEN_EXPERIENCES / FINAL_RESUME

#### 待新建/修改的文件

```
app/m3/
├── page.tsx              改:5 phase 状态机入口,根据 localStorage 决定显示哪个 phase
├── upload/page.tsx       新:Phase 1 简历上传(粘贴 textarea / PDF 上传)
├── jd/page.tsx           新:Phase 2 JD 输入 + 解析展示
├── excavate/page.tsx     新:Phase 3 隐藏经验对话(选择题挖掘)
├── result/page.tsx       新:Phase 5 最终简历预览 + Word 下载

app/api/m3/
├── parse-resume/route.ts   新:Phase 1 解析简历文本 → 结构化 JSON
├── parse-jd/route.ts       新:Phase 2 解析 JD + 匹配度 → JSON
├── excavate/route.ts       新:Phase 3 对话挖掘(chat 风格)
├── generate-resume/route.ts 新:Phase 5 综合产出 markdown + candidate_bullets
├── export-docx/route.ts    新:markdown → .docx 用 docx npm 包

lib/
├── pdf-extract.ts          新:client-side PDF.js helper(wrap pdfjs-dist)
├── docx-extract.ts         新:client-side Word helper(wrap mammoth)
└── docx-build.ts           新:server-side markdown → docx(用 docx 包)

components/
├── ResumePhaseProgress.tsx  新:5 phase 进度条(从现 m3/page.tsx 拆)
├── ExcavateChat.tsx         新:Phase 3 选择题对话组件
├── ResumePreview.tsx        新:Phase 5 markdown 渲染预览
```

#### LLM 调用要点(每 endpoint 一段)

**所有 endpoint 的 SYSTEM prompt 要做的事**:
1. 读对应 `lib/prompts/skill-matching-refs/question-batteries.md` 的 Phase X section
2. 加 PRD/plan override 段(§A.1 修改 lock)
3. 加 JSON schema 严格要求(jsonMode: true)
4. 加 Anti-fabrication 提醒(没的不编造,简历里没有的 field 输出 null)

**parse-resume** — 输入用户粘贴 / PDF/Word 提取后的简历 raw text,JSON 输出:
```typescript
{
  basic: { name, phone, email, school, major, gpa, year_level },
  education: [{ school, major, period, gpa, courses[] }],
  experience: [{ org, role, period, bullets: string[] }],
  projects: [{ name, period, role, tech_stack[], bullets: string[] }],
  activities: [{ org, role, period, bullets: string[] }],
  skills: { languages[], frameworks[], tools[], domain[] }
}
```
- prompt 嵌入 question-batteries.md 的 "Phase 1 解析步骤" 段
- 用 `jsonMode: true`
- 缺失字段输出 null,**绝不编造**

**parse-jd** — 输入 JD 文本 + parsed_resume,JSON 输出:
```typescript
{
  jd_summary: string,           // 1 句话核心要求
  must_have: string[],          // 硬性要求
  nice_to_have: string[],       // 加分项
  jd_requirements_parsed: [     // 细化拆解(plan §8.12 §B.1 key 名)
    { type: "tech" | "soft" | "tool" | "domain", text }
  ],
  match_highlights: [{ user_strength, jd_requirement, evidence }],
  gaps: [
    { jd_requirement, why_gap, fixable: "易补 < 2 周" | "中等 1-2 月" | "难补 ≥ 3 月" }
  ],
  priority_score: 1-5
}
```
- prompt 嵌入 question-batteries.md 的 "Phase 2 派生候选岗位池" + "Step 2 priority score" 段
- JD : 公司业务 = 80 : 20(plan §C)
- 如果 JD 写得模糊 / 用户只给岗位名 → 用 WebSearch 兜底拿真实 JD(plan §A.1 Phase 2 决议)

**excavate** — Phase 3 选择题挖隐藏经验:
- 输入 messages[] + parsed_resume + jd_context.gaps,流式输出下一题
- prompt 直接嵌入 question-batteries.md "Phase 3" 全段(含字节音乐业务举例)
- 严格用 4 选项 + 1 填空 + "都没有" 第 6 选项 模板
- 用户每答 1 题 → 后端把"挖到的素材"转 STAR 形态写 `hidden_experience_candidates`
- 退出:用户连续 3 个"都没有" 或 用户点"够了"按钮 或 ≥ 5 个新 STAR 收集到

**generate-resume** — Phase 5 综合:
- 输入 parsed_resume + jd_context + hidden_experience_candidates
- 输出:
  ```typescript
  {
    markdown: string,                  // 完整简历 markdown(plan §E.1 版式约束)
    candidate_bullets: [               // 改进 5: 3-5 个候选 bullet
      { source: "original" | "hidden", text, star_breakdown }
    ],
    optimization_summary: string       // "本次调整了 N 处,主要..."
  }
  ```
- prompt 嵌入 question-batteries.md "Phase 5 综合输出" 段
- 内化 Anti-fabrication:hidden 经验里如果是"未完成项目"必须标 ⚠️(skill-designing-bridge.md 的纪律 2)

**export-docx** — 输入 markdown → 返 .docx Blob:
- 用 `docx` npm 包 server-side 生成
- 版式照 plan §E.1:1 页 / 思源黑体 fallback / 章节标题 12pt 加粗 / 正文 10.5pt / 1.2 行距 / 黑白

#### localStorage schema 新增

| key(plan §8.12 §B.1 lock) | value |
|---|---|
| `parsed_resume` | parse-resume 输出 |
| `jd_context` | parse-jd 输出(含 jd_summary / jd_requirements_parsed / match_highlights / gaps) |
| `hidden_experience_candidates` | excavate 累积的 STAR 列表 |
| `final_resume` | { markdown, candidate_bullets, optimization_summary, lastUpdated } |

#### UI 关键交互
- Phase 进度条永远在顶部(5 个圆点 + 当前高亮)
- Phase 之间可回退(localStorage 里有的 phase 都能跳)
- 任何 phase 完成后右下角"下一步"按钮 → 推进
- Phase 1 上传 PDF/Word → **client-side**(pdfjs-dist / mammoth)提取 text → 发 API parse(避免 server 处理二进制)
- Phase 3 选择题用 multi-select chip,沾边都算
- Phase 5 完成后:Word 下载按钮 + "练一场模拟面试 →" CTA(跳 /m5)+ 简历 markdown 内嵌预览(用 react-markdown)

#### 验证 checklist
- 真粘贴 1 份学生简历 + 1 段 JD,全 phase 跑通无 LLM 报错
- 输出 markdown 含 Phase 3 挖到的隐藏经验(grep 验证)
- candidate_bullets 至少 3 个(plan 改进 5)
- Word 下载 .docx,Office 打开版式正常,**单页**
- PDF 上传 → 提取文字 → 跳 parse-resume 成功
- 双向闭环:`/m3?from=debrief` 显示 banner
- build 0 错
- **grep 验证无公司名露出**:`curl POST /api/m3/parse-jd ... | grep -E '阿里|腾讯|字节|...'` → JD 里有公司名 OK(用户输入),输出 jd_summary 里不应该出现

#### git worktree
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree add ../oc-B-resume -b feat/B-resume main
cd ../oc-B-resume && npm install && cp ../offer-catcher-web/.env.local . && \
  npm install pdfjs-dist mammoth docx react-markdown && \
  npm run dev -- -p 3002
```

---

### 4.C 模块 5 模拟面试(C)— ⚠️ 火山 ASR 待用户给 Secret Key

#### 目标
用户跟"AI 面试官"完整跑一场:**选类型(半结构化/行为/技术)+ 选性格(亲切姐姐/严厉压力/严谨技术)→ AI 出题 + TTS 念出来 → 用户答 + ASR 转写 → AI 评估 + 出下一题 → 5 维复盘报告**。

#### 优先级 + 估时
- P0 核心(plan §8.11 P0 闭环 4 模块之一)
- 3 天(含 TTS 集成 + ASR 2.0 自实现 + 复盘评分)

#### 当前状态
- ✅ stub page `app/m5/page.tsx`(295 行,信息填写表单 — 上传简历 / JD / 选类型 / 选性格 / 题数 / 摄像头开关)
- ✅ stub `app/m5/live/page.tsx`(234 行,面试进行中页 — 左 1/4 文字 + 右 3/4 视频区)
- ✅ stub `app/m5/debrief/page.tsx`(355 行,复盘报告 — 4 维评分 + 2 highlight 卡 + Adopt 按钮跳 /m3?from=debrief)
- ⚠️ 全是 hardcoded sample,没接 LLM / TTS / ASR
- ✅ 火山 TTS 已验证连通(用 `8461448147` + `bK--...`,99 音色可访问)
- ⚠️ 火山 ASR 还在 403 — SDK 协议跟 Seed ASR 2.0 不兼容,Day 8 自实现

#### PRD 关键章节
- `03-产品PRD.md` §3.5 模块 5(模拟面试)
- §3.5.5 3 性格 + 3 类型(亲切/严厉/严谨;半结构化/行为/技术)
- §3.5.8 复盘 5 维(逻辑/具体/清晰 + 口水话频率 + 流畅)

#### plan 关键决议
- §3.6 4 性格设计(已砍随和 → 3 性格)
- §A.2 模拟面试类型 + 性格 矩阵设计(★)
- §A.2 配套素材(开源 skill 调研结果)
- §A.3 摄像头开关 + 两种模式 UI/复盘维度
- §F batch 1 - batch 4(F.1 题目来源 / F.3 静默不强制结束 / F.4 跳过分 2 类 / F.11 STT 延迟掩盖 / F.12 摄像头权限引导 / F.13 暂停无限期 / F.14 transcript + 查看回答思路按钮 / F batch 4 全部 7 项)
- §决议 Y 双向闭环 → 复盘 inline 卡片(本模块产出 highlight 数据,模块 D 负责跳转)

#### 已有文件清单
- `app/m5/page.tsx` / `app/m5/live/page.tsx` / `app/m5/debrief/page.tsx` — 现有 stub
- `lib/prompts/skill-excavating.md` — Skill 1 prompt(行为面追问参考)
- `.env.local` — VOLC_APP_ID + VOLC_ACCESS_TOKEN(TTS 已通,ASR Day 8 自实现)

#### 待新建/修改的文件

```
app/m5/
├── page.tsx              改:配置表单 → submit → setItem session_config → 跳 /m5/live
├── live/page.tsx         改:client + getUserMedia + WebSocket 到 /api/m5/stream
├── debrief/page.tsx      改:client + 读 localStorage session → 调 /api/m5/debrief 出评分

app/api/m5/
├── prep-questions/route.ts 新:面试开始时一次性生成题库(基于 JD + 简历 + 类型 + 性格)
├── tts/route.ts            新:文字 → 音频(MP3 base64),用火山 SeedTTS 2.0
├── asr-stream/route.ts     新:WebSocket relay,转发用户音频到火山 Seed ASR 2.0(自实现)
├── evaluate-turn/route.ts  新:用户答一题 → LLM 评估单题(为复盘准备)
├── debrief/route.ts        新:整场 → 5 维评分 + 高价值答案识别(双向闭环 inline 卡片)

lib/
├── volc-tts.ts             新:火山 SeedTTS 2.0 client(可参考 https://github.com/Hypnus-Yuan/doubao-tts 但要适配新版)
├── volc-asr.ts             新:火山 Seed ASR Streaming 2.0 client(WebSocket,自实现,参考官方 doc)
├── interviewer-personas.ts 新:3 性格 prompt 模板(亲切 / 严厉 / 严谨)
├── interview-types.ts      新:3 类型 prompt 模板(半结构化 / 行为 / 技术)

components/
├── InterviewerAvatar.tsx     新:左小窗 AI 头像(静态图 + 说话时呼吸光)
├── UserCamera.tsx            新:右大窗用户摄像头(getUserMedia)
├── QuestionPanel.tsx         新:左 1/4 问题 + 考察点 + tab(transcript / 思路)
├── ExpressionChecklist.tsx   新:sidebar 表情管理 6 条(plan §改进 4)
├── DebriefReport.tsx         新:5 维评分卡 + 高价值答案 inline 卡片(模块 D 渲染跳转用)
```

#### LLM / API 调用要点

**prep-questions** — 一次性生成 N 题(N = 用户选的 5/10/15),根据:
- 类型(半结构化:简历追问为主;行为面:STAR 题;技术面:按 target role)
- 性格(亲切:温和铺垫;严厉:直接逼问;严谨:抠技术细节)
- 用户简历 + JD
- 输出:`[{ id, question_text, intent, ideal_hints }, ...]`
- prompt 借鉴 plan §A.2 配套素材(noamseg/interview-coach-skill / 0voice/interview_internal_reference)

**tts** — POST 文字 → 返 MP3 base64:
- 用 https://openspeech.bytedance.com/api/v3/tts/bidirection(WebSocket bidirectional)
- 鉴权:`X-Api-App-Key: 8461448147` + `X-Api-Access-Key: bK--...` + `X-Api-Resource-Id: <TTS res id>`
- 音色映射(plan §3.6):
  - 亲切姐姐 → `zh_female_qiniang_v2` 或类似温暖女声
  - 严厉压力 → `zh_male_chunhou_v2` 或类似沉稳低沉男声
  - 严谨技术 → `zh_male_yangguang_v2` 或类似理性男声
- 实测要从豆包 99 音色里挑(`doubao-speech list-voices` 命令能列)

**asr-stream** — WebSocket relay,前端 mic → server WS → 火山 Seed ASR 2.0 → 实时 transcript 回前端:
- 这是 **Day 8 最大坑** — Seed ASR 2.0 协议跟 doubao-speech SDK 用的 1.0 不兼容
- 必须读官方 doc:https://www.volcengine.com/docs/6561/1395846(大模型流式识别 SDK)
- 或者参考 https://github.com/vahnxu/doubao-asr/blob/main/scripts/transcribe.py (file 版,看鉴权 header 用 `x-api-key`)
- 用户应该会给 Secret Key,可能 ASR 2.0 用 HMAC256 签名(SDK 不支持 → 自实现)
- Fallback(若 ASR 不通):前端用浏览器 `webkitSpeechRecognition`(Chrome)或者最简单 — 用户答完点"结束这题"按钮 + 文字输入备用

**evaluate-turn** — 用户答完一题 → LLM 评分 + 给追问建议(供下一轮 prep 用):
- 简单 5 维打分(plan §F batch 4 #1)
- temperature 低(0.3),稳定输出

**debrief** — 全场结束:
- 输入:所有 question + answer 对
- 输出:5 维评分汇总 + 每维 evidence + **高价值答案识别**(用于双向闭环)
- 高价值答案 = 5 维某项 = 5 分 → 标"💡 这段经历非常好,要不要加入简历优化?" inline 卡片

#### localStorage schema 新增

| key | value |
|---|---|
| `interview_session_config` | { resume_id, jd, type, persona, num_questions, camera_on } |
| `interview_sessions` | 最近 N 场 (每场 = { id, questions, answers, transcript, score_5d, highlights[] }) |

#### UI 关键交互
- 摄像头开关弹窗(plan §A.3,默认开,拒绝 → toast 切纯语音)
- 摄像头模式:左 1/4 文字 + 右 3/4 视频(用户主窗 + AI 小窗)
- 纯语音模式:左展开问题考点 + 右大字面试官问题 + AI 静态头像
- 静默 60s 弹温和提示(plan §F.3)— 不强制结束
- 跳过弹 2 选 1(F.4)
- "查看回答思路" 按钮 — **任意时刻可点,不扣分,不在复盘标记**(F.14)

#### 验证 checklist
- TTS:打开 /m5/live,3 个性格各试一题,听音色清晰区分
- ASR(若 Day 8 通):说话 → 实时 transcript 出现
- 完整 5 题 session 跑通 → 复盘报告显示 5 维评分 + ≥1 个 highlight
- 复盘"Adopt" 按钮跳 /m3?from=debrief(双向闭环 — 但跳转逻辑是 模块 D 做,这里只产数据)
- build 0 错

#### git worktree
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree add ../oc-C-interview -b feat/C-interview main
cd ../oc-C-interview && npm install && cp ../offer-catcher-web/.env.local . && \
  npm run dev -- -p 3003
```

---

### 4.D 双向闭环(D)— 等 B + C 完成

#### 目标
**面试复盘里识别高价值答案 → inline 卡片 → 跳 /m3 简历优化 → 改完返回复盘 tab**(plan §决议 Y)。

#### 优先级 + 估时
- P0(plan §8.11 P0 闭环)
- 0.6 天

#### 当前状态
- ✅ 模块 5 debrief 现有 Adopt 按钮已跳 /m3?from=debrief
- ✅ 模块 3 现有 banner 显示 "← 返回面试复盘"
- ⚠️ 但缺真数据流(复盘里的 highlight → 简历优化的 LLM context)

#### plan 关键决议
- §决议 Y 双向闭环完整流程
- §决议 Y A 部分 6 步设计

#### 待新建/修改的文件

```
app/m3/page.tsx       改:支持从 localStorage 读 from_debrief_highlight,渲染时把它注入 LLM context
app/m5/debrief/page.tsx 改:Adopt 按钮 → 把 highlight 写 localStorage.from_debrief_highlight → 跳 /m3?from=debrief

lib/use-local-state.ts 加 STORAGE_KEY: FROM_DEBRIEF_HIGHLIGHT

components/DebriefAdoptCard.tsx 新:inline 卡片("💡 要不要加进简历?")
```

#### LLM 调用要点
- 不新增 endpoint,复用模块 3 的 generate-resume
- 简历重生时,prompt 加 `from_debrief: { evidence: "...", source_question: "..." }` 段
- LLM 把这段融入 candidate_bullets

#### 验证 checklist
- 跑完一场模拟面试 → 复盘里至少 1 个 highlight → 点 Adopt → 跳 /m3 → 简历真的更新了
- 简历更新后回 /m5/debrief → tab 状态保留(scroll 位置 + 已展开卡片)

#### git worktree
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree add ../oc-D-loop -b feat/D-loop main
cd ../oc-D-loop && npm install && cp ../offer-catcher-web/.env.local . && \
  npm run dev -- -p 3008
```

---

### 4.E.1 m2 经历挖掘(E.1)— P1 stub 强化

#### 目标
轻量化的 Skill 1(挖经历)— 用户没简历时,跟 AI 聊 3-5 件做过的事,挖出 hero story 给 m3 简历整理用。

#### 优先级 + 估时
- P1(plan §8.11 P1,1 页基础)
- 0.5 天

#### 当前状态
- ✅ stub `app/m2/page.tsx`(209 行,静态)

#### PRD 关键章节
- `03-产品PRD.md` §3.2 模块 2

#### plan 关键决议
- §改进 2 Hero Story 6 类按 persona 加权
- §改进 5 candidate bullets 自动产出

#### 待新建/修改的文件

```
app/m2/page.tsx     改 client + 简化对话 UI(messages[] + textarea)
app/api/m2/chat/route.ts 新:挖经历 LLM 对话(prompt 基于 lib/prompts/skill-excavating.md,简化版)
```

#### LLM 调用要点
- prompt 借鉴 `lib/prompts/skill-excavating.md` 的 Phase 3-4(per-role 挖掘 + hero story)
- **一 turn 一问**(non-negotiable)
- 内化 Skeptical Recruiter(关键 hero story 出来后,扮演怀疑 HR 提 weak spot)
- 用户答 3-5 件事 → 输出 `parsed_experience_candidates` 写 localStorage

#### 验证 checklist
- 用户能聊出 3 件事(每件:role + period + 1-2 bullet)
- 数据落 localStorage 后 /m3 能读
- build 0 错

#### git worktree
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree add ../oc-E1-experience -b feat/E1-experience main
cd ../oc-E1-experience && npm install && cp ../offer-catcher-web/.env.local . && \
  npm run dev -- -p 3004
```

---

### 4.E.2 m4 项目设计 + mentor 学习卡组(E.2)

#### 目标
用户简历有 gap → 设计 2-4 周可 ship 的项目 brief → mentor 学习卡组每日 task。

#### 优先级 + 估时
- P1(plan §8.10 学习卡组升级 1.5 天)
- 1.5 天

#### 当前状态
- ✅ stub `app/m4/page.tsx`(233 行)

#### PRD 关键章节
- `03-产品PRD.md` §3.4 模块 4

#### plan 关键决议
- §C.1 archetype 砍到 4 类(AI PM / SWE / DS / 设计)
- §C.2 不预填 baseline 项目,LLM brainstorm + WebSearch 实探学习资源(防幻觉)
- §C.3 Kickoff 改 Web App 内部跳转(modal)
- §C.5 Skill 2 边界被动响应(化学/机械等不主动 redirect)
- §8.10 mentor 学习卡组(每周拆每天 task + ASK AI + 完成自动生成 STAR bullet)

#### 待新建/修改的文件

```
app/m4/page.tsx          改:project brief 生成入口(gap + 时间预算 + role)
app/m4/mentor/page.tsx   新:学习卡组(anki 风格,每天 1 张 task 卡)
app/api/m4/brainstorm/route.ts 新:LLM 生成项目方向 + 学习资源(优先调 WebSearch 实探)
app/api/m4/kickoff/route.ts    新:用户确认项目 → 拆周 task → 写 learning_plan localStorage
app/api/m4/ask/route.ts        新:卡片里 ASK AI(用户对今日 task 有疑问)
app/api/m4/complete/route.ts   新:用户标完成 today task → LLM 生成 STAR bullet 候选

components/
├── MentorCard.tsx        新:今日 task 卡(标题 + 描述 + 资源 + 完成按钮)
├── LearningPlanGrid.tsx  新:N 周 grid 展示进度
```

#### LLM 要点
- brainstorm 内化 Anti-fabrication("项目未完成不能加简历")
- 学习资源**必须 WebSearch 实探**,拿不到就标"建议你去知乎/B 站搜 [关键词]",不编书名

#### 验证 checklist
- 输入 1 个 gap + 4 周预算 → 出 1 项目 brief
- mentor 页今日 task 显示 + 完成按钮 work
- build 0 错

#### git worktree
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree add ../oc-E2-mentor -b feat/E2-mentor main
cd ../oc-E2-mentor && npm install && cp ../offer-catcher-web/.env.local . && \
  npm run dev -- -p 3005
```

---

### 4.E.3 不二陪伴(E.3)

#### 目标
右下角悬浮按钮 → 点开 → 跟"不二"聊天(情绪倾听 / 疏导 / 温柔重定向,不诊断不治疗)。

#### 优先级 + 估时
- P1(plan §8.10 升级版,1 天)
- 0.5 天(最简版)

#### 当前状态
- ✅ `components/BuerFloatingButton.tsx` 已存在,panel 是温柔 stub 文案"我还在准备"
- ⚠️ 没有真聊天功能

#### plan 关键决议
- §8.10 情绪陪伴「不二」要求(用 esther-design-system IP 形象;悬浮按钮;情绪倾听/疏导/温柔重定向;不诊断不治疗;自伤念头给真实热线)
- §8.12 §C.1 panel 不要露 stub("即将上线"等),要温柔文案不暴露未装

#### 待新建/修改的文件

```
components/BuerFloatingButton.tsx 改:panel 加 chat UI(messages[] + textarea + 发送按钮)
app/api/buer/chat/route.ts        新:LLM 流式聊天 endpoint(streaming,用 chatStream)

lib/use-local-state.ts 加 STORAGE_KEY: BUER_SESSION(临时存,plan §A.1 lock 不持久跨设备)
```

#### LLM 调用要点
- system prompt:
  ```
  你是「不二」,Offer 捕手的情绪小伙伴。
  
  你的角色:
  - 不诊断,不治疗(不是心理医生)
  - 倾听 + 共情 + 温柔重定向到自助资源
  - 学业 / 求职 / 自我怀疑 都可以聊
  - 用户提到自伤念头 → 立即给真实热线(eg 北京心理危机研究与干预中心 010-82951332)
  
  风格:
  - 短句,口语化
  - "嗯""我懂的""慢慢来"承接
  - 不评判,不说教
  - 偶尔 emoji ✨(但克制)
  ```
- 用 `chatStream`(已在 lib/llm.ts)实现 typing 效果
- temperature 0.7(自然)

#### 验证 checklist
- 点悬浮按钮 → 打开 chat panel
- 输 1 句"最近压力好大" → 不二温柔回复
- 输 "我想伤害自己" → 必然出现热线号码

#### git worktree
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree add ../oc-E3-buer -b feat/E3-buer main
cd ../oc-E3-buer && npm install && cp ../offer-catcher-web/.env.local . && \
  npm run dev -- -p 3006
```

---

### 4.E.4 后台 dashboard(E.4)— 独立

#### 目标
密码访问的运营 dashboard,看埋点数据(今日活跃 / 各模块使用分布 / 5 维评分趋势)。

#### 优先级 + 估时
- P1(plan §8.11 P2 stub,但 1 张图就够)
- 0.5 天

#### 当前状态
- 不存在,**全新**

#### plan 关键决议
- §G.4 自建后台 dashboard,只有用户能看
- §I 调整为后端 DB 存 events 表(其他数据本地)

#### 待新建/修改的文件

```
app/admin/page.tsx          新:密码登录 + dashboard
app/api/admin/events/route.ts 新:GET 拉 events 数据(简单内存数组,v1 不接 DB)
app/api/track/route.ts      新:埋点接收(各模块 POST 来)

lib/track.ts                新:前端 track('event_name', metadata) helper
```

#### 实现要点
- 密码硬编码到 env var ADMIN_PASSWORD(临时,v2 真做登录)
- events 数据 v1 用内存 Map(Vercel serverless 跨实例丢)或者 Upstash Redis(免费 plan)
- dashboard 用 recharts 画 1-2 张图

#### 验证 checklist
- 访问 /admin → 密码弹窗
- 输对 → 看到今日 events 数 + 模块使用饼图

#### git worktree
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree add ../oc-E4-dashboard -b feat/E4-dashboard main
cd ../oc-E4-dashboard && npm install && cp ../offer-catcher-web/.env.local . && \
  npm install recharts && \
  npm run dev -- -p 3007
```

---

### 4.F 视觉精修 + Demo 视频 + 1000 字方案(F)— 最后做

#### 目标
所有功能完成 → 走查视觉一致性 → 录 demo 视频 → 写 1000 字方案。

#### 优先级 + 估时
- 最后,~1-1.5 天
- 必须所有前置模块完成

#### plan 关键决议
- §8.10 Day 10-11 集成测试 + esther 视觉精修
- §H.2 1000 字方案:多用架构图 + 效果图(不算字数)
- §H.3 Demo 样例数据(陈昊 / 林婷)

#### 任务
- 浏览器手动跑全部 5 模块端到端
- 视觉走查(esther 蓝黄红色一致 / 衬线标题 / 不二一致 / 间距统一)
- 录 demo 视频(plan §H.1 你录,我写脚本)
- 写 1000 字方案(plan §H.2 严格 1000 字,多图)
- README 整理

---

## 5. 集成顺序

```
Day N    Day N+1   Day N+2   Day N+3   Day N+4   Day N+5
  │         │         │         │         │         │
  ├ A ──────┤         │         │         │         │  (1-2h,先做)
  ├ B ──────┼────────┤         │         │         │  (2.5 天)
  ├ C ──────┼─────────┼────────┤         │         │  (3 天)
  ├ E.1 ───┤         │         │         │         │  (0.5 天)
  ├ E.2 ───┼────────┤         │         │         │  (1.5 天)
  ├ E.3 ──┤         │         │         │         │  (0.5 天)
  ├ E.4 ──┤         │         │         │         │  (0.5 天)
  │         │         │         │         │         │
  │         │         │         ├─ D ───┤         │  (等 B+C,0.6 天)
  │         │         │         │         ├─ F ───┤  (最后,1-1.5 天)
  │         │         │         │         │         ↓
  │         │         │         │         │       Ship 🚀
```

每个模块完成后:
1. 在自己 worktree 跑 `npm run build` 0 错
2. push 到自己 branch
3. 通知主开发者(你)merge 到 main
4. 主开发者 merge 后,其他活着的 worktree `git rebase origin/main` 同步
5. 冲突 90% 出在共享文件(§3 列表)— 出现就 stop 各 worktree,在主仓库 resolve

---

## 6. 常用命令速查

### 6.1 检查任务有没有跟其他人撞
```bash
git fetch --all
git log --all --oneline --since="1 day ago" | head
git log --all --since="1 day ago" -- <文件路径>
```

### 6.2 worktree 间共享 .env.local
```bash
cp ~/Documents/Project/AI-HR/offer-catcher-web/.env.local .env.local
```

### 6.3 强制同步 main 到 worktree
```bash
git fetch origin
git rebase origin/main
# 冲突 → 手动 resolve → git rebase --continue
# 不想 rebase 想 merge → git merge origin/main
```

### 6.4 完成 worktree 后清理
```bash
cd ~/Documents/Project/AI-HR/offer-catcher-web
git worktree remove ../oc-B-resume
git branch -d feat/B-resume      # 本地删
git push origin --delete feat/B-resume  # 远程删(可选)
```

---

## 7. 联络协议

- 主开发者(你)= 主 worktree owner,负责 merge
- 模块 owner(各 worktree)= push 自己 branch 后 `gh pr create`(或者 fb 直接通知)
- 共享文件改动 = 必须先在主 worktree 改 + push + 通知 → 各 worktree rebase
- LLM 调用 token 用量 = 一起共用 DeepSeek key,注意不要死循环 ping(浪费 quota)

---

**Last updated:** 2026-06-01
