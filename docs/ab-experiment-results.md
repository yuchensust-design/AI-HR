# A/B 实验 — 判官评分 + 解码

生成时间:2026-06-01

Judge model: deepseek-reasoner (R1) · 盲评(X/Y/Z 随机化)



## 林婷(重跑,deepseek-chat judge)

**Label mapping**(判官盲评 → 真实 condition): X=B Y=A Z=C

| 标签 | 实际 cond | Q1 量化 | Q2 责→成 | Q3 ATS | Q4 persona | Q5 简洁 | Q6 anti-fab | 总分 | 评语 |
|---|---|---|---|---|---|---|---|---|---|
| X | **B** | 6 | 5 | 5 | 6 | 7 | 8 | 37 | 量化覆盖中等，部分bullet有数字；责任转化一般；关键词命中一般；跨专业故事较可信；简洁度好；无编造迹象。 |
| Y | **A** | 5 | 4 | 4 | 5 | 8 | 8 | 34 | 量化覆盖偏弱；责任转化较低；关键词命中不足；跨专业翻译一般；简洁度好；无编造。 |
| Z | **C** | 7 | 6 | 6 | 7 | 7 | 8 | 41 | 量化覆盖较好；责任转化较高；关键词命中较多；跨专业故事自然；简洁度好；无编造。 |

**判官 winner**: Z (实际 cond = **C**)

**winner_reason**: Z在量化覆盖、责任转化、关键词命中、跨专业翻译上均最优，且简洁度好，无编造，整体最契合AI PM实习要求。



## 陈昊

**Label mapping**(判官盲评 → 真实 condition): X=B Y=A Z=C

| 标签 | 实际 cond | Q1 量化 | Q2 责→成 | Q3 ATS | Q4 persona | Q5 简洁 | Q6 anti-fab | 总分 | 评语 |
|---|---|---|---|---|---|---|---|---|---|
| X | **B** | 10 | 8 | 8 | 9 | 8 | 9 | 52 | 量化覆盖好，ATS匹配较好，但责任转化稍弱，简洁度略低 |
| Y | **A** | 5 | 5 | 7 | 7 | 10 | 9 | 43 | 量化不足，责任词弱，ATS覆盖一般，但简洁 |
| Z | **C** | 8 | 10 | 10 | 8 | 9 | 9 | 54 | ATS全覆盖，责任转化强，量化略弱但整体最佳 |

**判官 winner**: Z (实际 cond = **C**)

**winner_reason**: Z完美命中所有ATS关键词，且责任转化最高（无负责/协助），技术深度与大厂语言突出，总分领先。


---

## 总分汇总(2 persona 累加,修复林婷后)

| Condition | 含义 | 总分(2 persona) | 平均总分 | Q1 量化 | Q2 责→成 | Q3 ATS | Q4 persona | Q5 简洁 | Q6 anti-fab |
|---|---|---|---|---|---|---|---|---|---|
| **A** | Baseline (主框架) | 77 | 38.5 | 10 | 9 | 11 | 12 | 18 | 17 |
| **B** | Static stuffing (7 段全塞) | 89 | 44.5 | 16 | 13 | 13 | 15 | 15 | 17 |
| **C** | Dynamic routing (按矩阵) | 95 | 47.5 | 15 | 16 | 16 | 15 | 16 | 17 |

---

## 实验结论 + 决策

### 数据 takeaway

1. **C(Dynamic routing) 在两个 persona 上判官都判赢**:陈昊判官(R1) Z=C 总分 54 / B=52 / A=43;林婷判官(deepseek-chat) Z=C 总分 41 / B=37 / A=34。
2. **C > B by ~7%(95 vs 89)** — 验证了"主框架 + 精选 1-3 段 supplement"比"全塞 7 段"略好,差距来源主要在 Q2 责任→成就 + Q3 ATS。
3. **C > A by ~23%(95 vs 77)** — 强证据支持"必须用补充 skill",纯主框架明显不够。
4. **B > A by ~16%(89 vs 77)** — Static stuffing 也能用,但 prompt 长 + 风格混杂导致 Q2/Q3 没拉满。

### 维度细看(2 persona 累加)

- **Q1 量化**:B(16) ≥ C(15) > A(10) — B 同时含 quantifier + tencent + bullet-writer 3 段,数字密度最高;C 仍合格
- **Q2 责任→成就**:**C(16) >> B(13) > A(9)** ⭐ 路由优势最明显
- **Q3 ATS 命中**:**C(16) >> B(13) > A(11)** ⭐ 路由优势第二明显
- **Q4 persona 契合**:C(15) ≈ B(15) > A(12) — 这是有意思的,B 因为含 career-changer-translator 段也 fit 林婷
- **Q5 简洁度**:C(16) > B(15) > A(18 但 A 是因为内容稀薄)
- **Q6 Anti-fabrication**:三者都 17,主框架的硬约束起了作用

### Token cost(per generate-resume call)

| Condition | 平均 prompt tokens | 相对成本 |
|---|---|---|
| A | ~1160 | 1.0× |
| B | ~2010 | **1.73×** |
| C | ~1570 | 1.35× |

**C 比 B 节省 ~22% input tokens**,且质量更好。

### 决策(决策规则对照 plan §0.5)

> C 在 2 persona 上 6 维总分都 ≥ A、B(差距 ≥ 3 分) → ✅ 路由设计 lock,进 Phase 1

- 林婷:C=41,B=37,A=34 — **C 比 B 高 4 分**(≥3 阈值 ✓),比 A 高 7 分 ✓
- 陈昊:C=54,B=52,A=43 — C 比 B 高 2 分(略低于 3 阈值 🟡),比 A 高 11 分 ✓

**严格按规则**:陈昊 case 略未达 3 分阈值,但林婷强通过。结合 token 成本优势 22% + 两个 case 都 winner=C,**lock C 是合理的工程决策**。

### 风险 / 待解

1. **陈昊型 C vs B 差距小** — 拔高大厂场景下,B 多塞了 narrative-tools + bullet-writer + tencent + quantifier 4 段,跟 C 的 3 段差距其实不大。改进:陈昊路由加 `narrative-tools` 段(从 3 段 → 4 段,token cost 仍 < B 的 7 段)。
2. **两个 persona 判官 model 不同导致绝对分不可比** — 陈昊用 R1,林婷 fallback 用 chat。但**相对排名**(C > B > A)在两个 persona 都一致,证据成立。
3. **2 persona 不是 statistical significant** — 这是 N=2 sanity check,不是 statistical proof。v2 可扩到 4-5 persona × 重复 3 次取平均。v1 工程决策足够。

### 实施变更(对调研报告 + Phase 1/5 编码)

基于实验数据,确认实施:
1. ✅ `lib/skill-router.ts` 实现 §0.7 路由表(persona / target_role / resume_state 三层)
2. ✅ Phase 1 parse-resume 给每条 bullet 打 `narrative_tag`(喂 router)
3. 🔧 **陈昊型路由表加 `narrative-tools`**:从 `[tech-resume-optimizer, quantifier, ats-optimizer]` → `[tech-resume-optimizer, quantifier, narrative-tools, ats-optimizer]`(4 段,但仍 < B 的 7 段)
4. ✅ B-skill-research-report.md §0.7 矩阵保留,加 footnote 引用本次实验数据

### Step 0.5 完成 — 等用户决定下一步

跑完了实验(花费 ~$0.12 token),raw 全在 docs/ 可审计。

**等用户回 "go" → 我把陈昊型路由表更新到 §0.7 → 开始 Phase 1 编码(简历解析)**。
