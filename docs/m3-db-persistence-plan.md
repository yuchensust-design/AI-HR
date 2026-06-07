# 模块 3 分析产物落库实施报告(给执行 agent)

> **执行者须知**:本报告自带全部上下文,假设你对本代码库零了解。按 Task 顺序执行,每步给了**确切文件路径 + 确切前后代码**。不要跳步,不要自由发挥。完成后跑 Verification。

**Goal:** 登录用户的 m3 分析产物(AI 修改建议 / 采纳决策 / 评分 / 面试准备)从 localStorage 升级为 **Supabase DB 按会话持久化**。效果:登录用户点回任意旧会话 = 上次的建议 + 采纳状态 + 分数 + 面试准备**原样恢复**,跨设备一致,不重新生成(类 ChatGPT 打开历史对话)。游客保持 localStorage 不变。

**Architecture:** `m3_resumes` 表加 4 个 jsonb 列;result 页用两个统一读写 helper(`readArtifact` / `writeArtifact`)按"登录走 DB 列 / 游客走 localStorage"双轨;edits / metrics / prep 用内容签名(sig)判断是否复用,sig 变(简历或 JD 改了)才重算并回存;decisions 按行存(无 sig)。

**Tech Stack:** Next.js(App Router)+ React + TypeScript + Supabase(@supabase/ssr,RLS 已配)。

**Worktree:** `/Users/hyc/Documents/Project/AI-HR/oc-m3-antifab`(branch `feat/m3-antifab-interact`)。dev server 已在 `localhost:3010`。

---

## 0. baseline 现状(执行前必读)

本 worktree 已经完成关键词修复(A+B),**本报告在此之上继续**,不要回退:
- `lib/keyword-match.ts` 已存在(确定性关键词命中)。
- `app/api/m3/parse-jd/route.ts` 已产出 `jd_keywords`,存在 `jdContext.jd_keywords`(即 DB 的 `jd_context_json`)→ **关键词命中对登录用户已是 DB 支撑的,本报告不动它**。
- `app/m3/result/page.tsx` 当前用 localStorage 缓存:`editsCacheKey` / `metricsCacheKey` / `prepCacheKey` / `decisionsKey`——**这正是本报告要双轨化的 4 块**。

现状的问题:登录用户的这 4 块只在 localStorage,换设备 / 清缓存 / 重开会话就丢或重算。`m3_resumes` 现在只存 `parsed_resume_json` / `jd_context_json` / `hidden_experience_json` / `final_resume_md` / `final_resume_docx_url`。

关键事实:
- `m3_resumes` 的 RLS 策略是 `for all`(`own m3 via conv`),**新加列自动继承,无需改 RLS**。
- `m3_resumes_updated_at` 触发器已存在,**无需新建**。
- result 页读 DB 数据靠 `useM3DBSync()` 的 `dbData`(一次 `select *` 拿整行),写靠 `saveField(field, value)`(单列 update)。`isLoggedInWithConv` 区分双轨。
- result 页已有 gate:`if (isLoggedInWithConv && dbLoading) return <loading>`,所以 effect 跑时登录用户的 `dbData` 已加载完(含新列)。

---

## Task 1: DB migration — 加 4 个 jsonb 列

**Files:**
- Create: `supabase/migrations/003_m3_analysis_cache.sql`

- [ ] **Step 1: 写 migration 文件**

```sql
-- 003_m3_analysis_cache.sql
-- 模块 3 分析产物落库(plan: m3-db-persistence)
-- 让登录用户的 AI 建议 / 采纳决策 / 评分 / 面试准备 按会话持久化,跨设备一致。
-- RLS 已由 001 的 "own m3 via conv"(for all)覆盖,新列自动继承,无需新策略。
-- updated_at 触发器已存在,无需新建。

ALTER TABLE m3_resumes
  ADD COLUMN IF NOT EXISTS edits_json          jsonb,  -- { sig: string, result: SuggestEditsResult }
  ADD COLUMN IF NOT EXISTS decisions_json      jsonb,  -- { decisions, rewritten, srAnswers, keywordResponses }
  ADD COLUMN IF NOT EXISTS metrics_json        jsonb,  -- { sig: string, metrics: LlmMetrics }
  ADD COLUMN IF NOT EXISTS interview_prep_json jsonb;  -- { sig: string, prep: PrepCategory[] }
```

- [ ] **Step 2: 在 Supabase 控制台跑这段 SQL**

⚠️ **这一步必须由项目所有者在 Supabase Dashboard → SQL Editor 手动执行**(执行 agent 无法替跑生产库 DDL,环境里只有 publishable/secret key,无 DDL 通道)。
跑完确认 4 列已加(`Table Editor → m3_resumes` 能看到新列)。
**如果这步没做,登录用户写 DB 会静默失败(列不存在),功能不生效。**

---

## Task 2: M3Row 类型加 4 个字段

**Files:**
- Modify: `lib/sync/useM3DBSync.ts`

- [ ] **Step 1: 在 `M3Row` 类型里加字段**

找到(约 18-27 行):

```ts
export type M3Row = {
  conversation_id: string;
  parsed_resume_json: unknown | null;
  jd_context_json: unknown | null;
  hidden_experience_json: unknown[] | null;
  final_resume_md: string | null;
  final_resume_docx_url: string | null;
  updated_at: string;
};
```

改为:

```ts
export type M3Row = {
  conversation_id: string;
  parsed_resume_json: unknown | null;
  jd_context_json: unknown | null;
  hidden_experience_json: unknown[] | null;
  final_resume_md: string | null;
  final_resume_docx_url: string | null;
  // 分析产物落库(m3-db-persistence)
  edits_json: unknown | null;
  decisions_json: unknown | null;
  metrics_json: unknown | null;
  interview_prep_json: unknown | null;
  updated_at: string;
};
```

`select("*")` 已自动取新列,`saveField(field, value)` 的 `field: keyof M3Row` 自动允许新字段,**无需改 useM3DBSync 其它逻辑**。

---

## Task 3: result 页加两个统一读写 helper

**Files:**
- Modify: `app/m3/result/page.tsx`

- [ ] **Step 1: 在 `applyEditsResult` 函数定义之后、`loadSuggestions` 之前插入 helper**

定位锚点(约 222-240 行,`applyEditsResult` 结尾):

```ts
    setDecisions(initialDecisions);
    setStatus("ready");
  }
```

在它**之后**插入:

```ts

  // 统一产物读写:登录 → DB 列(jsonb),游客 → localStorage(plan m3-db-persistence)
  const readArtifact = useCallback(
    <T,>(dbField: keyof M3Row, lsKey: string): T | null => {
      if (isLoggedInWithConv) {
        const v = (dbData as Partial<M3Row> | null)?.[dbField];
        return (v ?? null) as T | null;
      }
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(lsKey);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    [isLoggedInWithConv, dbData],
  );

  const writeArtifact = useCallback(
    (dbField: keyof M3Row, lsKey: string, value: unknown) => {
      if (isLoggedInWithConv) {
        void saveField(dbField, value);
        return;
      }
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(lsKey, JSON.stringify(value));
      } catch {
        /* quota — ignore */
      }
    },
    [isLoggedInWithConv, saveField],
  );

  // metrics 内容签名(内容 + 决策变 → v2 bullets 变 → STAR/硬门槛要重算)
  const metricsSig = useMemo(
    () => cheapSig(contentSig + JSON.stringify({ d: decisions, r: rewritten })),
    [contentSig, decisions, rewritten],
  );
```

- [ ] **Step 2: 确认 import**

文件顶部需有 `M3Row` 类型。检查 `import { useM3DBSync } from "@/lib/sync/useM3DBSync";` 这行,改成同时导出类型:

```ts
import { useM3DBSync, type M3Row } from "@/lib/sync/useM3DBSync";
```

(`useCallback` / `useMemo` / `cheapSig` 文件里已有,无需再 import。)

---

## Task 4: loadSuggestions(AI 修改建议)双轨化 + sig 复用

**Files:**
- Modify: `app/m3/result/page.tsx`

- [ ] **Step 1: 替换整个 `loadSuggestions` useCallback**

找到(约 242-287 行)当前实现:

```ts
  const loadSuggestions = useCallback(async (force = false) => {
    if (!parsedResume) return;
    setStatus("loading");
    setErrorMsg("");
    // 命中缓存 → 直接出(像竞品:加载一次后再进来秒开)
    if (!force && typeof window !== "undefined") {
      try {
        const cached = window.localStorage.getItem(editsCacheKey);
        if (cached) {
          applyEditsResult(JSON.parse(cached) as SuggestEditsResult);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    try {
      const res = await fetch("/api/m3/suggest-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          jdContext: jdContext ?? null,
          hiddenExperiences: hiddenExperiences ?? [],
          fromDebriefHighlight: fromDebriefHighlight ?? null,
          optimizationGoals: optimizationGoals ?? [],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as SuggestEditsResult;
      try {
        window.localStorage.setItem(editsCacheKey, JSON.stringify(parsed));
      } catch {
        /* ignore quota */
      }
      applyEditsResult(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载失败";
      setErrorMsg(message);
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedResume, jdContext, hiddenExperiences, fromDebriefHighlight, optimizationGoals, editsCacheKey]);
```

整体替换为:

```ts
  const loadSuggestions = useCallback(async (force = false) => {
    if (!parsedResume) return;
    setStatus("loading");
    setErrorMsg("");
    // 命中缓存(登录=DB / 游客=localStorage)+ sig 匹配 → 直接出,不重算
    if (!force) {
      const cached = readArtifact<{ sig: string; result: SuggestEditsResult }>(
        "edits_json",
        editsCacheKey,
      );
      if (cached?.result && cached.sig === contentSig) {
        applyEditsResult(cached.result);
        return;
      }
    }
    try {
      const res = await fetch("/api/m3/suggest-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          jdContext: jdContext ?? null,
          hiddenExperiences: hiddenExperiences ?? [],
          fromDebriefHighlight: fromDebriefHighlight ?? null,
          optimizationGoals: optimizationGoals ?? [],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as SuggestEditsResult;
      writeArtifact("edits_json", editsCacheKey, { sig: contentSig, result: parsed });
      applyEditsResult(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载失败";
      setErrorMsg(message);
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedResume, jdContext, hiddenExperiences, fromDebriefHighlight, optimizationGoals, editsCacheKey, contentSig, readArtifact, writeArtifact]);
```

---

## Task 5: loadLlmMetrics(评分)双轨化

**Files:**
- Modify: `app/m3/result/page.tsx`

- [ ] **Step 1: 替换 `loadLlmMetrics` 顶部的缓存读取段**

找到(约 296-307 行):

```ts
  const loadLlmMetrics = useCallback(async () => {
    if (!parsedResume) return;
    // B:先查缓存 — 同内容 + 同决策直接复用,避免每次刷新现算导致分数忽高忽低
    try {
      const cached = window.localStorage.getItem(metricsCacheKey);
      if (cached) {
        setLlmMetrics(JSON.parse(cached) as LlmMetrics);
        return;
      }
    } catch {
      /* ignore */
    }
    setLlmMetricsRefreshing(true);
```

替换为:

```ts
  const loadLlmMetrics = useCallback(async () => {
    if (!parsedResume) return;
    // 先查缓存(登录=DB / 游客=localStorage)+ sig 匹配 → 复用,避免刷新现算导致分数忽高忽低
    const cachedMetrics = readArtifact<{ sig: string; metrics: LlmMetrics }>(
      "metrics_json",
      metricsCacheKey,
    );
    if (cachedMetrics?.metrics && cachedMetrics.sig === metricsSig) {
      setLlmMetrics(cachedMetrics.metrics);
      return;
    }
    setLlmMetricsRefreshing(true);
```

- [ ] **Step 2: 替换 `loadLlmMetrics` 底部的写缓存段**

找到(约 391-403 行):

```ts
      setLlmMetrics(metrics);
      // B:缓存,同内容 + 同决策 → 同分数,不再每次刷新现算
      try {
        window.localStorage.setItem(metricsCacheKey, JSON.stringify(metrics));
      } catch {
        /* quota — ignore */
      }
    } catch (err) {
      console.error("[loadLlmMetrics] failed:", err);
    } finally {
      setLlmMetricsRefreshing(false);
    }
  }, [parsedResume, jdContext, data, decisions, rewritten, metricsCacheKey]);
```

替换为:

```ts
      setLlmMetrics(metrics);
      // 缓存(登录=DB / 游客=localStorage),同内容 + 同决策 → 同分数
      writeArtifact("metrics_json", metricsCacheKey, { sig: metricsSig, metrics });
    } catch (err) {
      console.error("[loadLlmMetrics] failed:", err);
    } finally {
      setLlmMetricsRefreshing(false);
    }
  }, [parsedResume, jdContext, data, decisions, rewritten, metricsCacheKey, metricsSig, readArtifact, writeArtifact]);
```

---

## Task 6: loadInterviewPrep(面试准备)双轨化 + sig 复用

**Files:**
- Modify: `app/m3/result/page.tsx`

- [ ] **Step 1: 替换整个 `loadInterviewPrep` useCallback**

找到(约 415-454 行)当前实现:

```ts
  const loadInterviewPrep = useCallback(
    async (force = false) => {
      if (!parsedResume) return;
      if (!force && typeof window !== "undefined") {
        try {
          const cached = window.localStorage.getItem(prepCacheKey);
          if (cached) {
            setInterviewPrep(JSON.parse(cached) as PrepCategory[]);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      setInterviewPrepLoading(true);
      setInterviewPrepError("");
      try {
        const res = await fetch("/api/m3/interview-prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parsedResume, jdContext: jdContext ?? null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { categories?: PrepCategory[] };
        const cats = Array.isArray(json.categories) ? json.categories : [];
        setInterviewPrep(cats);
        try {
          window.localStorage.setItem(prepCacheKey, JSON.stringify(cats));
        } catch {
          /* ignore quota */
        }
      } catch (err) {
        console.error("[interview-prep] failed:", err);
        setInterviewPrepError("生成失败,点重试再来一次");
      } finally {
        setInterviewPrepLoading(false);
      }
    },
    [parsedResume, jdContext, prepCacheKey],
  );
```

整体替换为:

```ts
  const loadInterviewPrep = useCallback(
    async (force = false) => {
      if (!parsedResume) return;
      if (!force) {
        const cached = readArtifact<{ sig: string; prep: PrepCategory[] }>(
          "interview_prep_json",
          prepCacheKey,
        );
        if (cached?.prep && cached.sig === contentSig) {
          setInterviewPrep(cached.prep);
          return;
        }
      }
      setInterviewPrepLoading(true);
      setInterviewPrepError("");
      try {
        const res = await fetch("/api/m3/interview-prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parsedResume, jdContext: jdContext ?? null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { categories?: PrepCategory[] };
        const cats = Array.isArray(json.categories) ? json.categories : [];
        setInterviewPrep(cats);
        writeArtifact("interview_prep_json", prepCacheKey, { sig: contentSig, prep: cats });
      } catch (err) {
        console.error("[interview-prep] failed:", err);
        setInterviewPrepError("生成失败,点重试再来一次");
      } finally {
        setInterviewPrepLoading(false);
      }
    },
    [parsedResume, jdContext, prepCacheKey, contentSig, readArtifact, writeArtifact],
  );
```

---

## Task 7: 决策(采纳/维持/改写/SR/关键词)双轨化

**Files:**
- Modify: `app/m3/result/page.tsx`

- [ ] **Step 1: 替换"决策恢复一次"effect**

找到(约 464-486 行):

```ts
  // 决策持久化:data ready 后恢复一次(persisted 覆盖自动接受的初值)
  useEffect(() => {
    if (status !== "ready" || !data || decisionsRestoredRef.current) return;
    decisionsRestoredRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(decisionsKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        decisions?: DecisionsMap;
        rewritten?: RewrittenMap;
        srAnswers?: Record<string, string>;
        keywordResponses?: Record<string, "can" | "vague" | "no">;
      };
      if (saved.decisions) setDecisions((d) => ({ ...d, ...saved.decisions }));
      if (saved.rewritten) setRewritten((r) => ({ ...r, ...saved.rewritten }));
      if (saved.srAnswers) setSrAnswers((a) => ({ ...a, ...saved.srAnswers }));
      if (saved.keywordResponses) setKeywordResponses((k) => ({ ...k, ...saved.keywordResponses }));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data]);
```

替换为:

```ts
  // 决策持久化:data ready 后恢复一次(登录=DB / 游客=localStorage)
  useEffect(() => {
    if (status !== "ready" || !data || decisionsRestoredRef.current) return;
    decisionsRestoredRef.current = true;
    const saved = readArtifact<{
      decisions?: DecisionsMap;
      rewritten?: RewrittenMap;
      srAnswers?: Record<string, string>;
      keywordResponses?: Record<string, "can" | "vague" | "no">;
    }>("decisions_json", decisionsKey);
    if (!saved) return;
    if (saved.decisions) setDecisions((d) => ({ ...d, ...saved.decisions }));
    if (saved.rewritten) setRewritten((r) => ({ ...r, ...saved.rewritten }));
    if (saved.srAnswers) setSrAnswers((a) => ({ ...a, ...saved.srAnswers }));
    if (saved.keywordResponses) setKeywordResponses((k) => ({ ...k, ...saved.keywordResponses }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data]);
```

- [ ] **Step 2: 替换"变更即存"effect(登录用 debounce 防 DB 刷爆)**

找到(约 488-500 行):

```ts
  // 决策持久化:变更即存(恢复完成后才开始写,避免空值覆盖)
  useEffect(() => {
    if (!decisionsRestoredRef.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        decisionsKey,
        JSON.stringify({ decisions, rewritten, srAnswers, keywordResponses }),
      );
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions, rewritten, srAnswers, keywordResponses]);
```

替换为:

```ts
  // 决策持久化:变更即存(恢复完成后才写,避免空值覆盖)
  // 游客 → localStorage 即时;登录 → DB,debounce 800ms 防止每次点击都打 DB
  useEffect(() => {
    if (!decisionsRestoredRef.current) return;
    const payload = { decisions, rewritten, srAnswers, keywordResponses };
    if (!isLoggedInWithConv) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(decisionsKey, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
      return;
    }
    const t = setTimeout(() => {
      void saveField("decisions_json", payload);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions, rewritten, srAnswers, keywordResponses, isLoggedInWithConv]);
```

---

## Task 8: 验证(Verification)

- [ ] **Step 1: 类型检查**

Run: `cd /Users/hyc/Documents/Project/AI-HR/oc-m3-antifab && ./node_modules/.bin/tsc --noEmit`
Expected: 无输出(exit 0)。

- [ ] **Step 2: 构建**

Run: `./node_modules/.bin/next build 2>&1 | grep -iE "compiled|error|fail"`
Expected: `✓ Compiled successfully`,无 error。

- [ ] **Step 3: 游客回归(不能坏)**

dev server `localhost:3010`,**不登录**:走 m3 上传简历 → 填 JD → 进结果页。确认:建议出、能采纳/维持、刷新后建议+决策+分数仍在(localStorage 生效)。

- [ ] **Step 4: 登录用户落库(核心)**

确认 Task 1 Step 2 的 SQL 已在 Supabase 跑过。登录 → 新建 m3 会话 → 走完简历+JD → 结果页:
1. 采纳几条建议、答一个 SR 追问。
2. Supabase `Table Editor → m3_resumes` 看该 `conversation_id` 行:`edits_json` / `decisions_json` / `metrics_json` / `interview_prep_json` 应有数据(decisions 等 ~1s debounce 后)。
3. **换设备 / 无痕窗口重新登录** → 会话列表点回这个会话 → 建议、采纳状态、分数、面试准备**原样恢复,且没有重新生成**(网络面板无 `/api/m3/suggest-edits` 调用)。

- [ ] **Step 5: sig 失效正确性**

同一个登录会话里,回上一步**改简历或改 JD**(让 `contentSig` 变)→ 回结果页 → 应**重新生成**建议(因为 `edits_json.sig !== contentSig`)并回写新的。

---

## Notes / 边界

- **不动游客逻辑**:游客全程 localStorage,`isLoggedInWithConv` 为 false 时所有 helper 自动走 localStorage 分支。
- **不动 RLS / 触发器**:`m3_resumes` 的 `for all` 策略 + `updated_at` 触发器已覆盖新列。
- **关键词命中不在本报告范围**:已经是确定性 + `jd_context_json` 落库(见 §0)。
- **decisions 无 sig**:沿用旧设计(按 `conversation_id` 整行存)。若建议重生成导致 edit id 变,旧 decision 自然匹配不上而被忽略,可接受。
- **dbData 时序**:登录用户的 `dbData`(含新列)在 result 页渲染前已加载(有 `dbLoading` gate),故 effect 跑时 `readArtifact` 能拿到 DB 值。
- **commit**:全部通过后 `git add -A && git commit`。message 建议:`feat(m3): 分析产物落库 — 登录用户建议/决策/评分/面试准备按会话持久化(DB 双轨)`。**不要 push / merge**,等所有者确认(本仓库工作流:本地 dev 验证 → 所有者确认 → 才合并)。
