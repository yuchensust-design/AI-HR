/**
 * POST /api/m4/recommend — 模块 4 · 分档推荐(两步管道第②步)
 *
 * 吃 analyze-gaps 产出的(已勾选)gaps + 用户选的时间档,按 ROI 出高性价比方案:
 *   - sprint(冲刺 3-7天)→ LearningCard[]:看书/视频快速补概念 + 轻量可验证产出(不硬塞项目)
 *   - standard(标准 2-4周)→ ProjectCard[]:按天拆的 end-to-end 小项目
 *   - deep(深耕 1-2月+)→ ProjectCard[]:按周拆、带迭代的深项目
 *
 * 复用 bridge skill 方法论:project-archetypes 种子库 + 学习资源(反幻觉)+ Skeptical Recruiter 风险自检。
 *
 * Body:
 *   {
 *     timeTier: "sprint" | "standard" | "deep",
 *     gaps: ScoredGap[],          // 用户勾选要攻的(已带 impact / fixable_in)
 *     targetRole?: string,
 *     parsedResumeBrief?: string, // 简历摘要(≤500字)
 *   }
 * 返回:
 *   sprint   → { cards: M4LearningDraftCore[] }
 *   standard/deep → { projects: M4ProjectDraftCore[] }
 */

import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import type {
  ScoredGap,
  TimeTier,
  BridgeFit,
  M4ProjectDraftCore,
  M4LearningDraftCore,
  M4Resource,
} from "@/lib/m4-types";

export const maxDuration = 60;

type RequestBody = {
  timeTier: TimeTier;
  gaps: ScoredGap[];
  targetRole?: string;
  parsedResumeBrief?: string;
  bridgeFit?: BridgeFit; // 岗位适配度(来自 analyze-gaps)→ 决定兜底策略
};

// —— 按角色项目种子库(bridge skill 复用)——
let archetypesCache: string | null = null;
async function loadArchetypes(): Promise<string> {
  if (archetypesCache !== null) return archetypesCache;
  const fp = path.join(
    process.cwd(),
    "lib/prompts/skill-designing-bridge-refs/project-archetypes.md",
  );
  try {
    archetypesCache = await fs.readFile(fp, "utf-8");
  } catch {
    archetypesCache = "";
  }
  return archetypesCache;
}

/**
 * 种子库里真实存在的资源白名单(从 project-archetypes.md 逐行解析)。
 * covered 路径只准输出这里面的资源,代码兜底过滤掉 LLM 自创的(治资源名幻觉)。
 * 行格式:`  - 📖|🎬|📄 <资源名...>`
 */
type LibraryResource = { type: "book" | "video" | "doc"; title: string; lang: "zh" | "en" };
let libraryCache: { list: LibraryResource[]; byNorm: Map<string, LibraryResource> } | null = null;

// 归一化标题:去空白/标点/书名号/符号,转小写 → 容忍 LLM 复制时的细微差异,但编造的对不上
function normTitle(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

async function loadLibraryResources(): Promise<{
  list: LibraryResource[];
  byNorm: Map<string, LibraryResource>;
}> {
  if (libraryCache) return libraryCache;
  const md = await loadArchetypes();
  const list: LibraryResource[] = [];
  const byNorm = new Map<string, LibraryResource>();
  const re = /^\s*-\s*(📖|🎬|📄)\s*(.+?)\s*$/;
  for (const line of md.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    const type = m[1] === "📖" ? "book" : m[1] === "🎬" ? "video" : "doc";
    const title = m[2].trim();
    if (!title) continue;
    const lang: "zh" | "en" = /英文/.test(title) && !/中文|中译|译本/.test(title) ? "en" : "zh";
    const res: LibraryResource = { type, title, lang };
    list.push(res);
    const n = normTitle(title);
    if (n.length >= 2 && !byNorm.has(n)) byNorm.set(n, res);
  }
  libraryCache = { list, byNorm };
  return libraryCache;
}

/**
 * 把一条 LLM 输出的资源校验/钉回种子库真资源:命中→返回库里权威版本,未命中→null(丢弃)。
 *
 * 命中规则:
 *   - 归一化完全相等 → exact 命中(LLM 抄对了书名)。
 *   - 否则"实质重叠":较短的一方 ≥ 6 字、是较长一方的子串、且覆盖较长一方 ≥ 70%。
 *     这样既容忍 LLM 复制时多/少了出版社、书名号、作者(小幅噪声,占比高),
 *     又挡住"编造长书名借真短书名放行"(如 把《数据分析思维》注水成《数据分析思维实战:从入门到精通》,
 *     占比低 → 拒)和"4 字泛词借位"(如 LLM 只给"数据分析"→ 不足 6 字 → 拒)。
 * 返回 { res, exact }:exact=false 时调用方应丢弃 LLM 自带 note(可能是为另一本编造书写的简介)。
 */
const FUZZY_MIN_LEN = 6;
const FUZZY_MIN_COVER = 0.7;
function matchLibraryResource(
  rawTitle: string,
  byNorm: Map<string, LibraryResource>,
): { res: LibraryResource; exact: boolean } | null {
  const n = normTitle(rawTitle);
  if (!n) return null;
  const exact = byNorm.get(n);
  if (exact) return { res: exact, exact: true };
  for (const [cn, res] of byNorm) {
    const [short, long] = n.length <= cn.length ? [n, cn] : [cn, n];
    if (
      short.length >= FUZZY_MIN_LEN &&
      long.includes(short) &&
      short.length / long.length >= FUZZY_MIN_COVER
    ) {
      return { res, exact: false };
    }
  }
  return null;
}

// ROI:impact 降序;过滤到本档能补的;同分保持原序。high-impact 但本档补不了的留作诚实提示。
function rankGaps(gaps: ScoredGap[], tier: TimeTier): {
  picked: ScoredGap[];
  unfixable: ScoredGap[];
} {
  const sorted = [...gaps].sort((a, b) => b.impact - a.impact);
  const fixable = sorted.filter((g) => g.fixable_in?.[tier]);
  const unfixable = sorted.filter(
    (g) => !g.fixable_in?.[tier] && g.impact >= 4,
  );
  const topN = tier === "deep" ? 3 : 2;
  return { picked: (fixable.length ? fixable : sorted).slice(0, topN), unfixable };
}

// covered(命中 6 类种子库):资源必须逐字来自种子库,代码再兜底过滤
const LIB_RESOURCE_RULE = `【学习资源 — 锁定种子库,严禁自创】
- resources 里的每个 title **只能从上面「种子库」里逐字复制**真实资源名(连书名号/作者/出版社一起照抄),挑与这些 gap 最相关的。
- **严禁**输出种子库里没有的资源名、严禁改写书名、严禁自己编课程/UP主/网站。
- 找不到足够相关的,就少给几个甚至不给,**也绝不自创**。
- 不要输出任何 URL/链接(系统按名字自动生成搜索链接)。`;

// 库外(digital / hands_on):无种子库可锚 → 不点名具体资源,改给"搜索方向"
const SEARCH_RESOURCE_RULE = `【学习资源 — 给搜索方向,不点名具体资源】
- 这个岗位没有内置种子库,你**无法确认某本书/某门课/某个UP主是否真实存在**,所以**绝不点名具体资源**(不写书名/课程名/作者/UP主/网站名)。
- resources 改成**搜索方向**:title 填一个**精准的搜索关键词/主题词**(用户拿去搜就能找到该领域真实资料),note 说明"搜到后重点看什么"。type 决定搜索渠道(book=找书、video=找视频、doc=找文档/官网)。
- 例:title:"酸碱滴定 原理 实验步骤" / note:"重点看滴定终点判断和误差来源"。
- 不要输出任何 URL/链接。`;

const ANTI_FAB = `【反编造 — 永不违反】
1. 不输出公司名 / 产品名 / 学校名
2. 计划里写"计划做什么",不能写"已完成 N 次访谈"这种事实
3. 不承诺具体成果数字("可提升 30%"→禁止)
4. 学习资源**只推荐你确实记得存在的**(知名书 / 知名课 / 官方文档),给**准确的资源名**(用户靠名字就能搜到);**不要输出任何 URL/链接**(系统会按名字自动生成搜索链接);绝不编造资源名`;

function gapsBlock(gaps: ScoredGap[]): string {
  return gaps
    .map(
      (g, i) =>
        `${i + 1}. ${g.jd_requirement}(覆盖:${g.current_coverage} · impact ${g.impact})— ${g.why_matters}`,
    )
    .join("\n");
}

// —— sprint:学习卡 ——
function buildLearningSystem(archetypes: string, bridgeFit: BridgeFit): string {
  const inLibrary = bridgeFit === "covered";
  const resourceRule = inLibrary ? LIB_RESOURCE_RULE : SEARCH_RESOURCE_RULE;
  const libraryBlock = inLibrary
    ? `【资源种子库(resources 只能从这里逐字挑,见下方锁定规则)】
${archetypes || "(种子库未加载,用你的通用知识,严格遵守反幻觉)"}`
    : `【项目设计参考(仅供项目结构灵感,resources 不要照搬这里的资源名)】
${archetypes || "(无)"}`;
  return `你是「Offer 捕手」模块 4 的补强设计师。用户只有 **3-7 天(冲刺档)**,时间太短做不出像样项目,所以你设计的是**学习型快速补强**:用看书/看视频/读文档快速补上相关概念,产出一个轻量但可验证的东西(一页总结 / 一条帖 / 一份笔记)。

【冲刺档硬规则】
- 针对给定的 1-2 个 gap,每个 gap 出 1 张学习卡(共 1-2 张)
- concepts:3-6 个该 gap 下最该先搞懂的核心概念
- resources:2-3 个(规则见下方「学习资源」)
- micro_deliverable:3-7 天内能真做出的轻量可验证产出(一页概念总结 / 一条知乎/小红书帖 / 一份带截图的笔记)
- honest_use:诚实说明这在简历/面试里只能写成"了解/入门级 + 轻量产出",**不是"做过项目"**
- est_hours:预估总投入(如 "6-10h")
- 不要输出 weekly_plan / 周计划 —— 这是学习卡不是项目

${libraryBlock}

${resourceRule}

${ANTI_FAB}

【输出 — 严格 JSON,无 markdown】
{
  "cards": [
    {
      "kind": "learning",
      "covers_gaps": ["对应的 jd_requirement"],
      "title": "≤20字,如:快速补 A/B 测试基础",
      "why": "≤100字 为什么这张卡能补这些 gap",
      "concepts": ["核心概念1", "..."],
      "resources": [ { "type":"book"|"video"|"doc", "title":"准确的资源名(用户靠它搜得到)", "note":"为什么相关+看哪部分", "lang":"zh"|"en" } ],
      "micro_deliverable": "3-7天能产出的轻量可验证东西",
      "est_hours": "6-10h",
      "honest_use": "诚实落点:只能写成了解/入门级"
    }
  ]
}
返 JSON。`;
}

// —— standard / deep:项目卡 ——
function buildProjectSystem(
  tier: "standard" | "deep",
  archetypes: string,
  bridgeFit: BridgeFit,
): string {
  const inLibrary = bridgeFit === "covered";
  const resourceRule = inLibrary ? LIB_RESOURCE_RULE : SEARCH_RESOURCE_RULE;
  const dial =
    tier === "standard"
      ? `【标准档(2-4周)硬规则】
- 出 1-2 个项目,每个 2-4 周可独立完成
- plan_unit = "day"(按天拆);weeks 取 2-4;weekly_plan 每周 goal + 3-5 个 Day 粒度 task
- deliverables 1-2 个;metrics_dictionary 2-3 个;技术拉伸 ≤1 级(最多 1 个新工具)`
      : `【深耕档(1-2月+)硬规则】
- 出 1 个有迭代深度的项目(最多 2 个),5-8 周
- plan_unit = "week"(按周拆里程碑);weeks 取 5-8;weekly_plan 每周 goal + 2-4 个偏里程碑的 task(不必到天)
- deliverables 2-3 个 + 至少一项体现"迭代/真实用户/评测"的证据;metrics_dictionary 3-5 个;可含 1 个新框架(仍 ≤1 级拉伸基础上)`;

  return `你是「Offer 捕手」模块 4 的项目设计师。基于给定 gap 设计可独立完成、做完能写进简历的补强项目。

${dial}

【Skeptical Recruiter 自检(必做)】
每个项目末尾,扮演怀疑用户能否完成的 HR,给 1-3 条最尖锐的风险(时间/技术/真实用户从哪来等),每条配一句 mitigation,写进 risks[]。

【学习资源】
每个项目给 1-3 个项目内要学/查的资源(learning_resources),规则见下方「学习资源」。

${
  inLibrary
    ? `【资源/项目种子库(learning_resources 只能从这里逐字挑,见下方锁定规则)】
${archetypes || "(种子库未加载,用你的通用知识)"}`
    : `【项目设计参考(仅供项目结构灵感,learning_resources 不要照搬这里的资源名)】
${archetypes || "(无)"}`
}

${resourceRule}

${ANTI_FAB}

【tasks.id 格式】严格 "w<week>-d<序号>-<3-4位随机>",不含中文/空格(前端用它跟踪进度)。
【输出长度】总 JSON ≤ 8000 字符。

【输出 — 严格 JSON,无 markdown】
{
  "projects": [
    {
      "kind": "project",
      "source_gaps": [ { "jd_requirement": "...", "why_gap": "..." } ],
      "target_role": null,
      "target_company": null,
      "title": "≤24字,具体场景化",
      "why": "≤120字 为什么这项目能补这些 gap",
      "weeks": ${tier === "standard" ? "2|3|4" : "5|6|7|8"},
      "plan_unit": "${tier === "standard" ? "day" : "week"}",
      "weekly_plan": [
        { "week": 1, "goal": "本周里程碑", "tasks": [ { "id":"w1-d1-a1b2", "day":"${tier === "standard" ? "Day 1" : "Week 1"}", "task":"...", "hours":"2h" } ] }
      ],
      "deliverables": ["可拿出来的具体产出"],
      "metrics_dictionary": [ { "name":"指标名", "definition":"定义", "data_source":"数据来源" } ],
      "skills_required": ["技能"],
      "risks": [ { "risk":"尖锐风险", "mitigation":"缓解" } ],
      "learning_resources": [ { "type":"book"|"video"|"doc", "title":"准确的资源名(用户靠它搜得到)", "note":"", "lang":"zh"|"en" } ]
    }
  ]
}
返 JSON。`;
}

// —— digital(库外数字岗):无种子库锚定,加一条诚实降级 + 更狠反编造 ——
const OFF_LIBRARY_NOTE = `

[岗位库外提示] 这个岗位不在内置项目原型库中,没有可直接改造的种子。请用通用知识从零设计,并**额外严格**遵守反编造:学习资源只给你确实记得存在的(不确定就只给名字+方向,绝不编 URL/课程名)。`;

// —— hands_on(动手/实验/临床/产线):不出项目,给"可迁移数字证据"卡 ——
function buildHandsOnSystem(): string {
  return `你是「Offer 捕手」模块 4 的诚实补强顾问。用户的目标岗位属于**动手/实验/临床/产线/现场**类(化学生物实验、医护临床、制造工艺、土木施工等)——这类岗位的**硬证据来自真实实验室/实习/现场,一个人在家做不出能替代的"项目"**。

所以你**不编造项目**,而是给**可迁移的"数字证据"建议**:在家/校就能做、能体现相关能力、面试能聊,但**绝不冒充"实操经验"**。

【硬规则】
- 针对给定的 1-2 个缺口,每个出 1 张卡(共 1-3 张),kind 一律 "learning"。
- 每张卡是一条"可迁移数字证据"路径,挑贴合缺口的:
  · 公开数据集 / 实验数据的分析与可视化
  · 计算 / 模拟(计算化学、仿真、建模等纯软件能跑的)
  · 系统性文献综述 / 复现某篇论文的数据或方法部分
  · 方法论笔记 / SOP 梳理 / 行业理解 writeup
- concepts:3-6 个该路径要先搞懂的核心点。
- resources:2-3 个(规则见下方「学习资源」)。
- micro_deliverable:能真做出的轻量可验证产出(分析报告 / 可视化 / writeup / 笔记)。
- honest_use:**必须诚实点明** —— 只能在简历/面试写成"对 X 的理解 + 数字侧实践",**不能写成"做过实验/有实操经验"**;真·实操要靠真实实验室/实习争取。
- est_hours:预估投入。时间越充裕可多给 1 张或做深,但本质仍是"数字证据",不要升级成"项目"。

${SEARCH_RESOURCE_RULE}

【反编造 — 永不违反】
1. 不输出公司名 / 产品名 / 学校名
2. 只写"计划做什么",不写"已完成"
3. 不承诺数字成果
4. **绝不把数字替代物包装成真实实操经验**

【输出 — 严格 JSON,无 markdown】
{
  "cards": [
    {
      "kind": "learning",
      "covers_gaps": ["对应的 jd_requirement"],
      "title": "≤20字",
      "why": "≤100字 为什么这条能补这些缺口、为什么是数字替代",
      "concepts": ["..."],
      "resources": [ { "type":"book"|"video"|"doc", "title":"准确的资源名(用户靠它搜得到)", "note":"", "lang":"zh"|"en" } ],
      "micro_deliverable": "能产出的轻量可验证东西",
      "est_hours": "8-15h",
      "honest_use": "诚实落点:只能写成理解+数字侧实践,不是实操经验"
    }
  ]
}
返 JSON。`;
}

function buildUserPrompt(
  tier: TimeTier,
  picked: ScoredGap[],
  unfixable: ScoredGap[],
  targetRole: string | undefined,
  resumeBrief: string | undefined,
): string {
  const roleLine = targetRole ? `目标岗位:${targetRole}` : "目标岗位:(未指定)";
  const resumeLine = resumeBrief
    ? `\n[简历摘要]\n${resumeBrief}`
    : "\n[简历摘要] 用户未提供,按通用情况设计。";
  const unfixableLine =
    unfixable.length > 0
      ? `\n\n[注意] 以下高 impact 缺口在本时间档内做不出可信证据,请在设计时忽略它们做项目/学习卡,但你可以在 why 或后续提醒里诚实点到:\n${unfixable.map((g) => `- ${g.jd_requirement}`).join("\n")}`
      : "";
  return `${roleLine}
时间档:${tier}
${resumeLine}

要攻的缺口(已按 ROI 选好,请只针对这些设计):
${gapsBlock(picked)}${unfixableLine}

返 JSON。`;
}

// —— normalize ——
function normResource(r: Record<string, unknown>): M4Resource {
  const t = r.type === "video" || r.type === "doc" ? r.type : "book";
  const lang = r.lang === "en" ? "en" : "zh";
  // 不落库 LLM 现编的 url —— 那是幻觉来源,前端统一拼搜索链接(resourceSearchUrl)。
  return {
    type: t as "book" | "video" | "doc",
    title: String(r.title ?? ""),
    note: String(r.note ?? ""),
    lang: lang as "zh" | "en",
  };
}

/**
 * covered 兜底:把卡里的 resources 钉回种子库真资源,丢掉 LLM 自创的(治资源名幻觉)。
 * 命中→用库里权威 type/title/lang,保留 LLM 写的 note;未命中→丢弃。
 */
function lockResourcesToLibrary(
  resources: M4Resource[],
  byNorm: Map<string, LibraryResource>,
): M4Resource[] {
  const out: M4Resource[] = [];
  for (const r of resources) {
    const hit = matchLibraryResource(r.title, byNorm);
    if (!hit) continue;
    // 模糊命中:LLM 可能本想推另一本(被钉回真书),其 note 是给那本写的 → 丢弃,避免"真书名+错简介"。
    out.push({
      type: hit.res.type,
      title: hit.res.title,
      note: hit.exact ? r.note : "",
      lang: hit.res.lang,
    });
  }
  return out;
}

function normLearning(c: Record<string, unknown>): M4LearningDraftCore {
  return {
    kind: "learning",
    covers_gaps: Array.isArray(c.covers_gaps) ? c.covers_gaps.map(String) : [],
    title: String(c.title ?? "补强"),
    why: String(c.why ?? ""),
    concepts: Array.isArray(c.concepts) ? c.concepts.map(String) : [],
    resources: Array.isArray(c.resources)
      ? (c.resources as Record<string, unknown>[]).map(normResource)
      : [],
    micro_deliverable: String(c.micro_deliverable ?? ""),
    est_hours: String(c.est_hours ?? ""),
    honest_use: String(c.honest_use ?? ""),
  };
}

function normProject(p: Record<string, unknown>, tier: "standard" | "deep"): M4ProjectDraftCore {
  const planUnit = p.plan_unit === "week" || p.plan_unit === "day"
    ? (p.plan_unit as "day" | "week")
    : tier === "deep"
      ? "week"
      : "day";
  const weeksNum = Number(p.weeks);
  return {
    kind: "project",
    source_gaps: Array.isArray(p.source_gaps)
      ? (p.source_gaps as Record<string, unknown>[]).map((g) => ({
          jd_requirement: String(g.jd_requirement ?? ""),
          why_gap: String(g.why_gap ?? ""),
        }))
      : [],
    target_role: typeof p.target_role === "string" ? p.target_role : null,
    target_company: null,
    title: String(p.title ?? "补强项目"),
    why: String(p.why ?? ""),
    weeks: Number.isFinite(weeksNum) && weeksNum > 0 ? weeksNum : tier === "deep" ? 6 : 3,
    plan_unit: planUnit,
    weekly_plan: Array.isArray(p.weekly_plan) ? (p.weekly_plan as M4ProjectDraftCore["weekly_plan"]) : [],
    deliverables: Array.isArray(p.deliverables) ? p.deliverables.map(String) : [],
    metrics_dictionary: Array.isArray(p.metrics_dictionary)
      ? (p.metrics_dictionary as M4ProjectDraftCore["metrics_dictionary"])
      : [],
    skills_required: Array.isArray(p.skills_required) ? p.skills_required.map(String) : [],
    risks: Array.isArray(p.risks)
      ? (p.risks as Record<string, unknown>[]).map((r) => ({
          risk: String(r.risk ?? ""),
          mitigation: String(r.mitigation ?? ""),
        }))
      : [],
    learning_resources: Array.isArray(p.learning_resources)
      ? (p.learning_resources as Record<string, unknown>[]).map(normResource)
      : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const { timeTier, gaps, targetRole, parsedResumeBrief } = body;
    const bridgeFit: BridgeFit = body.bridgeFit ?? "covered";

    if (timeTier !== "sprint" && timeTier !== "standard" && timeTier !== "deep") {
      return NextResponse.json({ error: "timeTier 不合法" }, { status: 400 });
    }
    if (!Array.isArray(gaps) || gaps.length === 0) {
      return NextResponse.json({ error: "gaps 不能为空" }, { status: 400 });
    }

    const { picked, unfixable } = rankGaps(gaps, timeTier);

    // hands_on(动手/实验/临床/产线):不出项目,改给"可迁移数字证据"学习卡(复用 card 结构)
    if (bridgeFit === "hands_on") {
      const handsPrompt = buildUserPrompt(timeTier, picked, unfixable, targetRole, parsedResumeBrief);
      const raw = await chat(
        [
          { role: "system", content: buildHandsOnSystem() },
          { role: "user", content: handsPrompt },
        ],
        { model: "chat", temperature: 0.6, max_tokens: 3000, jsonMode: true },
      );
      let parsed: { cards?: unknown };
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error("[m4/recommend] hands_on JSON parse failed:", raw.slice(0, 500));
        return NextResponse.json({ error: "返回格式异常,请重试" }, { status: 502 });
      }
      const cards = Array.isArray(parsed.cards)
        ? (parsed.cards as Record<string, unknown>[]).map(normLearning).filter((c) => c.title)
        : [];
      if (cards.length === 0) {
        return NextResponse.json({ error: "未生成有效建议,请重试" }, { status: 502 });
      }
      return NextResponse.json({ cards, offLibrary: true, bridgeFit });
    }

    const archetypes = await loadArchetypes();
    // digital(库外数字岗):仍出项目/学习卡,但加诚实降级提示 + 标 offLibrary
    const offNote = bridgeFit === "digital" ? OFF_LIBRARY_NOTE : "";
    const userPrompt =
      buildUserPrompt(timeTier, picked, unfixable, targetRole, parsedResumeBrief) + offNote;

    if (timeTier === "sprint") {
      const raw = await chat(
        [
          { role: "system", content: buildLearningSystem(archetypes, bridgeFit) },
          { role: "user", content: userPrompt },
        ],
        { model: "chat", temperature: 0.7, max_tokens: 3000, jsonMode: true },
      );
      let parsed: { cards?: unknown };
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error("[m4/recommend] sprint JSON parse failed:", raw.slice(0, 500));
        return NextResponse.json({ error: "返回格式异常,请重试" }, { status: 502 });
      }
      const cards = Array.isArray(parsed.cards)
        ? (parsed.cards as Record<string, unknown>[]).map(normLearning).filter((c) => c.title)
        : [];
      if (bridgeFit === "covered") {
        const { byNorm } = await loadLibraryResources();
        for (const c of cards) c.resources = lockResourcesToLibrary(c.resources, byNorm);
      }
      if (cards.length === 0) {
        return NextResponse.json({ error: "未生成有效学习卡,请重试" }, { status: 502 });
      }
      return NextResponse.json({
        cards,
        ...(bridgeFit === "digital" ? { offLibrary: true, bridgeFit } : {}),
      });
    }

    // standard / deep
    const raw = await chat(
      [
        { role: "system", content: buildProjectSystem(timeTier, archetypes, bridgeFit) },
        { role: "user", content: userPrompt },
      ],
      { model: "chat", temperature: 0.7, max_tokens: 4000, jsonMode: true },
    );
    let parsed: { projects?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[m4/recommend] project JSON parse failed:", raw.slice(0, 500));
      return NextResponse.json({ error: "返回格式异常,请重试" }, { status: 502 });
    }
    const projects = Array.isArray(parsed.projects)
      ? (parsed.projects as Record<string, unknown>[])
          .map((p) => normProject(p, timeTier))
          .filter((p) => p.title)
      : [];
    if (bridgeFit === "covered") {
      const { byNorm } = await loadLibraryResources();
      for (const p of projects)
        p.learning_resources = lockResourcesToLibrary(p.learning_resources ?? [], byNorm);
    }
    if (projects.length === 0) {
      return NextResponse.json({ error: "未生成有效项目,请重试" }, { status: 502 });
    }
    return NextResponse.json({
      projects,
      ...(bridgeFit === "digital" ? { offLibrary: true, bridgeFit } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[m4/recommend] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
