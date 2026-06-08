/**
 * POST /api/m1/recommend — 模块 1 测评推荐(三段融合)
 *
 * Body: { answers: Record<number, string | string[]> }
 *
 * 三段:
 *   Step 1 计分(规则):computeRIASEC + formatRIASECCode + computeConfidence
 *   Step 2 候选池(规则):generateCandidates(scores, tags) → top 30
 *   Step 3 LLM 综合(deepseek-chat,JSON 模式):5 正向 + 3 反向 + 4-6 chip
 *
 * 返回:
 *   {
 *     scores: [R,I,A,S,E,C],
 *     code: "E9 I8 S6 ...",
 *     confidence: "high" | "mid" | "low" | "none",
 *     positive: [...5 项],
 *     negative: [...3 项],
 *     refine_chips: [...4-6 chip],
 *     disclaimer: "本次推荐基于测评 + 兴趣..."
 *   }
 *
 * plan §8.16 §D-§G lock
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import {
  computeRIASEC,
  formatRIASECCode,
  computeConfidence,
  getSelectedInterests,
  migrateAnswersSchema,
  type Confidence,
  type InterestWithStrength,
} from "@/lib/quiz-data";
import { generateCandidates, type CareerEntry } from "@/lib/career-pool";
import { createClient } from "@/lib/supabase/server";

// Vercel serverless 函数超时:LLM 调用常 >10s,默认 10s 会 504 → 必须显式拉到 60s(Hobby 上限)
export const maxDuration = 60;

const DISCLAIMER =
  "本次推荐基于测评 + 兴趣 — 没看你的真实经历。投递前请先用『简历整理』模块结合 JD 确认能力对齐。";

function buildSystemPromptNoResume(): string {
  return `你是「Offer 捕手」的兴趣岗位顾问。用户只完成了 RIASEC 测评，尚未上传简历。

【本次推荐的角色定位】
这是「方向指引」，不是「可投岗位清单」。
- RIASEC 揭示用户热爱什么、是什么样的人
- 简历决定用户现在能去哪里（用户还没提供简历）
- 任务：告诉用户「你的性格和兴趣倾向哪些方向」，不做可投性判断

【★ 决策优先级 — 测评主 / 兴趣辅 ★】
- 主信号 (70%) = RIASEC 6 维分数（基于霍兰德经典理论）
- 辅助信号 (30%) = 兴趣 tag（消费爱好，辅助微调，不能反向决定 RIASEC）
- 冲突时以 RIASEC 为准；兴趣 tag 只在 RIASEC 决定的方向内做微调

【硬约束 — 永远不许违反】
1. 永远不输出任何公司名 / 产品名 / 学校名，只能用行业 + 职位类型
2. positive 和 negative 只能从候选池里选，不创造新项
3. 不输出 employability_level 字段（没有简历，无法判断可投性）
4. why_fit 提「X 维度高/低」必须基于真实 6 维分数（3-15）
   - ≥12 = 高 / 9-11 = 中 / ≤8 = 低；数字不符则不说
5. 文案温和，用「可能适合」「值得探索」，避免「一定」「完全匹配」
6. 优先用用户 Top 3 真实高分维度做推荐依据

【反向 3 个的判定依据（只用这 3 条）】
a) 工作内容与用户 enjoy 信号反向
b) 长期天花板低 — 本科起点晋升空间小
c) 工作模式与用户 RIASEC 反向（E 型坐冷板凳 / I 型纯销售 / A 型纯流程）

【chip 设计】4-6 个，每个 ≤ 12 字，中文，口语化

【★ rationale 字段】
- experienceEvidence 必须填 null（没有简历）
- 其他 6 个子字段正常填，温和不绝对化

【输出格式 — 严格 JSON，无任何 markdown 包裹】
{
  "positive": [
    {
      "industry": "互联网",
      "role_type": "内容运营",
      "why_fit": "E(13/15)和 S(12/15)高，内容运营需要推动传播、跟用户互动，两点都契合",
      "match": "高",
      "match_percentage": 85
    }
  ],
  "negative": [
    {
      "industry": "传统制造",
      "role_type": "流水线质检",
      "why_consuming": "高度重复流程，E+A 的表达欲会被压抑"
    }
  ],
  "refine_chips": ["去掉销售岗", "想要更稳定", "加技术深度", "偏内容创作"],
  "rationale": {
    "interestEvidence": "...",
    "experienceEvidence": null,
    "preferenceSignals": "...",
    "confidence": "high",
    "confidenceWhy": "...",
    "cautions": ["..."],
    "nextStep": "...",
    "whyNotOther": "..."
  }
}

positive 共 6-10 个，覆盖 2-4 个行业大类，每大类 2-3 个职业
negative 正好 3 个
refine_chips 4-6 个，每个 ≤ 12 字
match_percentage：高匹配 75-95，中匹配 55-74，不低于 50，不给 100`;
}

function buildSystemPromptWithResume(): string {
  return `你是「Offer 捕手」的兴趣岗位顾问。用户做了 RIASEC 测评，也上传了简历。
任务：基于两路信号，推荐「现在可以投 / 值得去探索 / 长期可培养」三段分级方向。

━━━━━━━━━━━━━━━━━━━━━━━━
【两路信号的角色分工】
━━━━━━━━━━━━━━━━━━━━━━━━
★ 信号 A：RIASEC = 决定「推哪个方向」
- RIASEC 揭示用户的长期人格倾向和热爱
- 主信号权重 70%，兴趣 tag 辅助 30%
- 决定推荐方向的领域和职业类型

★ 信号 B：简历 = 决定「什么时候能投」
- 简历里的经历、技能、项目决定用户「现在的起点」
- 经历强相关 → 现在可以投（now）
- 经历有交叉但需要补强 → 值得去探索（needs_project）
- 无相关经历 → 长期可培养（long_term）

核心原则：RIASEC 决定方向，简历决定时机。

━━━━━━━━━━━━━━━━━━━━━━━━
【三个等级的定义】
━━━━━━━━━━━━━━━━━━━━━━━━
★ now（现在可以投）
- 标准：简历有直接对口的经历/技能，且 RIASEC 也契合
- 两个条件缺一不可：① 简历里有该职业需要的核心技能/经验 ② RIASEC 匹配
- Job Zone 仅作参考：Zone 1-2 但简历完全无关 → 不应进 now
- 「直接对口」示例：UI 设计实习 → 界面设计师（now）；非直接对口：UI 设计实习 → 演员/花艺师（❌ 不应进 now）

★ needs_project（值得去探索）— 这是最有价值的等级，必须存在
- 标准：RIASEC 指向这个方向，简历有「相邻经历」但不完全对口
- 核心：找到「现有经历 × RIASEC 方向」的交叉点，推出一个「桥接职位」
- 典型路径：用户已有背景 + RIASEC 方向 → 一个新的职位类型
- 花 3-6 个月做补强项目/转岗实习后可投递
- why_fit 必须体现桥接推理：「你做过 X，结合 RIASEC 的 Y 方向，可以转向 Z」

★ long_term（长期可培养）
- 标准 A（晋升路径）：now / needs_project 方向的高阶职位。RIASEC 和简历都契合，但需 1-2 年经验积累才能竞争该层级
  示例：产品经理（now）→ 产品总监（long_term）；内容运营（now）→ 内容策略总监（long_term）
- 标准 B（转型路径）：RIASEC 强烈指向但简历无相关经验的全新方向，需要系统转型
- 两种都是合理的 long_term，优先考虑标准 A（更贴近用户当前起点，更可信）

━━━━━━━━━━━━━━━━━━━━━━━━
【★ needs_project 的桥接思维 — 核心推理】
━━━━━━━━━━━━━━━━━━━━━━━━
核心问题：「这个人已有经历/技能 × RIASEC 最强方向 → 能拼成什么新职位？」

推理三步：
1. 用户已有什么经历/技能？（来自信号 B：简历）
2. RIASEC 最强方向是什么？（来自信号 A：测评）
3. 两者的交叉点 = 桥接职位（不放弃现有背景，沿 RIASEC 方向延伸）

━━━━━━━━━━━━━━━━━━━━━━━━
【★ few-shot 示例 — 参考此推理模式】
━━━━━━━━━━━━━━━━━━━━━━━━
示例用户：语文教师 3 年（备课/批改/家长沟通）| RIASEC：E14 S13 A9

✓ now → [教育与图书] 课程顾问
  理由：教师经验直接对口，沟通能力 E+S 完全契合，进入门槛低

✓ needs_project → [互联网教育] 教育产品运营（桥接推理）
  已有经历：教师的课程设计 + 学生管理 + 家长沟通（简历）
  RIASEC 方向：E14 → 推动/运营；S13 → 协调/服务（测评）
  交叉点：教育平台的课程运营/用户运营岗位
  为什么不是 now：没做过产品或运营类工作，需要补一段实习
  为什么不是 long_term：有教育背景，进入壁垒不高，3-6 个月可转型

✓ long_term → [管理岗位] 教育行业咨询顾问
  理由：E 高的远期方向，需积累系统行业知识和咨询方法论，目前简历不够

❌ 禁止这样做：
- needs_project 推「软件工程师」（教师经历无任何交叉，不是桥接）
- now 推「学术研究员」（需学术背景，简历完全不匹配）
- 把所有推荐堆在 long_term（逃避对简历的分析）

━━━━━━━━━━━━━━━━━━━━━━━━
【硬约束 — 永远不许违反】
━━━━━━━━━━━━━━━━━━━━━━━━
1. 永远不输出任何公司名 / 产品名 / 学校名
2. positive 和 negative 只能从候选池里选，不创造新项
3. why_fit 提「X 维度高/低」必须基于真实 6 维分数（≥12 高 / 9-11 中 / ≤8 低）
4. 三个等级（now / needs_project / long_term）各至少 1 个职业
5. 总共 6-10 个职位，合理分配三段
6. needs_project 的 why_fit 必须同时引用：
   (1) 简历里的具体经历（"你做过X / 有X经验"）
   (2) RIASEC 的具体方向（"结合Y维度高"）
   两者缺一不可；不能只引用 RIASEC 而没有连接简历经历
7. rationale.experienceEvidence 必须填（有简历），不能是 null
8. 文案温和，不绝对化
9. 等级与 Job Zone 参考（两者都要考虑）：
   - Zone 1-2 + 简历有直接技能对口 → now ✓
   - Zone 1-2 + 简历无直接相关经验 → needs_project（而非 now）
   - Zone 3 + 简历有相邻经验 → needs_project ✓
   - Zone 3/4 + 简历无相关经验 → long_term
   - Zone 4-5 + 简历有深度相关经验 → needs_project（绝不进 now）
   - Zone 4-5 + 简历无相关经验 → long_term ✓
   - 典型错误：「艺术总监/教授/研究员」进 now（Zone 4-5，绝对禁止）
10. 【领域相干性与学历壁垒】
    - needs_project 和 long_term 必须与简历核心领域有现实可及的转型路径
    - 【高校教职硬禁止】任何学科的「教授/副教授/讲师（高校）」需要博士学位，简历无博士学历或在读博士则一律禁推，包括「艺术教授/数字艺术教授/AI教授」等任何变体
    - 禁止跨越专业执照壁垒：简历无建筑/医学/法律/教育科班背景，不推「建筑学教授/外科医生/职业律师/注册会计师」等
    - 判断依据：用户通过 1-2 年努力是否真实可及？如需重读学位/拿执照才能入行，则禁推

━━━━━━━━━━━━━━━━━━━━━━━━
【输出格式 — 严格 JSON，无任何 markdown 包裹】
━━━━━━━━━━━━━━━━━━━━━━━━
{
  "positive": {
    "now": [
      {
        "industry": "教育与图书",
        "role_type": "课程顾问",
        "why_fit": "教师经验直接对口，E14+S13 的沟通能力完全契合，进入门槛低",
        "match": "高",
        "match_percentage": 88
      }
    ],
    "needs_project": [
      {
        "industry": "互联网教育",
        "role_type": "教育产品运营",
        "why_fit": "你的教学设计经验 × E 高方向 = 教育平台运营岗，补一段实习可以转型",
        "match": "高",
        "match_percentage": 80
      }
    ],
    "long_term": [
      {
        "industry": "管理岗位",
        "role_type": "教育行业咨询顾问",
        "why_fit": "E 高的远期方向，需积累系统的行业知识和咨询方法论",
        "match": "中",
        "match_percentage": 72
      }
    ]
  },
  "negative": [
    {
      "industry": "生产制造",
      "role_type": "流水线质检员",
      "why_consuming": "高度重复机械流程，E+S 的表达欲和协作需求会被压抑"
    }
  ],
  "refine_chips": ["不想转教育行业", "想要更高薪方向", "偏技术型岗位"],
  "rationale": {
    "interestEvidence": "...",
    "experienceEvidence": "你简历里的...经历，对...方向有直接帮助",
    "preferenceSignals": "...",
    "confidence": "high",
    "confidenceWhy": "...",
    "cautions": ["..."],
    "nextStep": "...",
    "whyNotOther": "..."
  }
}

【关键格式要求】
- positive 是嵌套对象（now / needs_project / long_term 三个 key），不是平铺数组
- 每个 key 至少 1 个职业，总共 6-10 个，合理分配三段
- needs_project 的 why_fit 必须体现桥接推理
- negative 3 个，refine_chips 4-6 个
- match_percentage：高匹配 75-95，中匹配 55-74，不低于 50，不给 100`;
}

type EvidenceForPrompt = {
  source: "resume" | "chat";
  summary: string;
  tags: string[];
  rawSnippet?: string;
  userNotes?: string;
} | null;

function buildUserPrompt(
  scores: [number, number, number, number, number, number],
  code: string,
  interests: InterestWithStrength[],
  pool: Array<{
    industry_cn: string;
    title_cn: string;
    title_en: string;
    riasec: Record<string, number>;
    job_zone?: number;
  }>,
  evidence: EvidenceForPrompt,
  hasResume: boolean,
): string {
  const [r, i, a, s, e, c] = scores;
  const interestStr =
    interests.length > 0
      ? interests
          .map((t) => `${t.key}(强度 ${t.strength}/5)`)
          .join(", ")
      : "(无)";

  const evidenceBlock = evidence
    ? `

[${hasResume ? "信号 B：简历信息" : "补充信息"}（来自${evidence.source === "resume" ? "用户上传的简历" : "用户聊补充信息时说的话"}）]
摘要：${evidence.summary}
关键字：${evidence.tags.slice(0, 15).join("、") || "(无)"}${
        evidence.rawSnippet
          ? `\n简历原文片段（why_fit 引用具体经历时用）：\n"""${evidence.rawSnippet.slice(0, 1500)}"""`
          : ""
      }${evidence.userNotes ? `\n用户原话（必须尊重）：${evidence.userNotes}` : ""}

${hasResume ? "基于信号 B：判断三段可投性（now/needs_project/long_term），needs_project 要体现「已有经历 × RIASEC 方向 → 桥接职位」的推理。" : "补充信息进 why_fit + match% 微调 + experienceEvidence，不冲击 RIASEC + 兴趣的主辅权重。"}`
    : "";

  const tailInstruction = hasResume
    ? "\n请返回嵌套 positive（now/needs_project/long_term 三个 key）格式的 JSON。"
    : "\n请返 JSON。";

  return `${hasResume ? "[信号 A：RIASEC 测评结果 — 决定推哪个方向]\n" : ""}用户测评结果（RIASEC 测评，6 维 × 3 题，5 点 Likert，每维 3-15 分）：
RIASEC 编码: ${code}
6 维分数（3-15）: R${r} I${i} A${a} S${s} E${e} C${c}
分数解读：≥12 高 / 9-11 中 / ≤8 低
选中兴趣 tag（带喜欢程度）: ${interestStr}${evidenceBlock}

候选池（${pool.length} 项，来自 O*NET 30.3 美国劳工部职业库，每项带 RIASEC 数值 + Job Zone 参考）：
${pool
  .map((p, idx) => {
    const z = (p as { job_zone?: number }).job_zone ?? 3;
    return `${idx + 1}. [${p.industry_cn}] ${p.title_cn}（${p.title_en}） | R${p.riasec.R} I${p.riasec.I} A${p.riasec.A} S${p.riasec.S} E${p.riasec.E} C${p.riasec.C} | JobZone=${z}`;
  })
  .join("\n")}
${tailInstruction}`;
}

type LlmRationale = {
  interestEvidence?: unknown;
  experienceEvidence?: unknown;
  preferenceSignals?: unknown;
  confidence?: unknown;
  confidenceWhy?: unknown;
  cautions?: unknown;
  nextStep?: unknown;
  whyNotOther?: unknown;
};

function normString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeRationale(
  raw: LlmRationale | null | undefined,
  confidence: Confidence,
  scores: [number, number, number, number, number, number],
  evidence: EvidenceForPrompt
) {
  const r = raw || {};
  const top1 = Math.max(...scores);
  const cautionsRaw = Array.isArray(r.cautions) ? r.cautions : [];
  const cautions = cautionsRaw
    .map((c) => normString(c))
    .filter((c) => c.length > 0)
    .slice(0, 3);

  const allowedConfidence = new Set<Confidence>(["high", "mid", "low", "none"]);
  const conf =
    typeof r.confidence === "string" && allowedConfidence.has(r.confidence as Confidence)
      ? (r.confidence as Confidence)
      : confidence;

  return {
    interestEvidence:
      normString(r.interestEvidence) ||
      "我们主要看了你 Top 3 维度跟职业偏好的契合度,以及你强烈喜欢的兴趣 tag。",
    experienceEvidence:
      r.experienceEvidence === null
        ? evidence
          ? // 有补充信息但 LLM 漏填 → 兜底用 summary 前 200 字
            `基于你${
              evidence.source === "resume" ? "上传的简历" : "聊补充信息时说的"
            },${evidence.summary.slice(0, 200)}`
          : null
        : normString(r.experienceEvidence) ||
          (evidence
            ? `基于你${
                evidence.source === "resume" ? "上传的简历" : "说的内容"
              },${evidence.summary.slice(0, 200)}`
            : null),
    preferenceSignals:
      normString(r.preferenceSignals) ||
      "结合 RIASEC 6 维 + 兴趣 tag 综合判断。",
    confidence: conf,
    confidenceWhy:
      normString(r.confidenceWhy) ||
      `已答 RIASEC 题数充足,Top1 = ${top1}/15,分布提供了基础判断依据。`,
    cautions:
      cautions.length > 0
        ? cautions
        : [
            "match% 是相对契合度,不是「一定能上岸」",
            "投递前请用『简历整理』结合具体 JD 再核对",
          ],
    nextStep:
      normString(r.nextStep) ||
      "可以先去『简历整理』,把现有经历针对最契合的方向 JD 调一版。",
    whyNotOther:
      normString(r.whyNotOther) ||
      "下面「反向 3 个」段会展开 — 我们只描述跟你的维度错配,不评判这些方向。",
  };
}

function sanitizeEvidence(rawEvidence: unknown): EvidenceForPrompt {
  if (!rawEvidence || typeof rawEvidence !== "object") return null;
  const e = rawEvidence as Record<string, unknown>;
  if (e.source !== "resume" && e.source !== "chat") return null;
  const summary = typeof e.summary === "string" ? e.summary.trim() : "";
  if (summary.length === 0) return null;
  const tagsRaw = Array.isArray(e.tags) ? e.tags : [];
  const tags = tagsRaw
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0 && t.length <= 20)
    .slice(0, 15);
  return {
    source: e.source,
    summary: summary.slice(0, 2000),
    tags,
    rawSnippet:
      typeof e.rawSnippet === "string" ? e.rawSnippet.slice(0, 1800) : undefined,
    userNotes:
      typeof e.userNotes === "string" ? e.userNotes.slice(0, 400) : undefined,
  };
}

type PositiveRaw = Record<string, unknown>;
type TieredPositive = {
  now: PositiveRaw[];
  needs_project: PositiveRaw[];
  long_term: PositiveRaw[];
};

function guaranteeThreeTiers(
  tiers: TieredPositive,
  candidates: CareerEntry[],
): TieredPositive {
  const result: TieredPositive = {
    now: [...tiers.now],
    needs_project: [...tiers.needs_project],
    long_term: [...tiers.long_term],
  };

  const injectedCodes = new Set<string>();
  const allInTiers = new Set(
    [...result.now, ...result.needs_project, ...result.long_term].map((p) =>
      String(p.role_type ?? ""),
    ),
  );

  const TIER_ZONES: Record<keyof TieredPositive, number[]> = {
    now: [1, 2],
    needs_project: [3],
    long_term: [4, 5],
  };

  const hintMap: Record<string, string> = {
    now: "基于测评方向补充，可结合真实 JD 验证是否匹配",
    needs_project: "基于测评方向和相邻经历补充，建议补一段相关项目后投递",
    long_term: "基于测评远期方向补充，适合作为长期规划",
  };

  for (const tier of ["now", "needs_project", "long_term"] as const) {
    if (result[tier].length === 0) {
      const zones = TIER_ZONES[tier];
      const fallback = candidates.find(
        (c) =>
          zones.includes(c.job_zone) &&
          !allInTiers.has(c.title_cn) &&
          !injectedCodes.has(c.code),
      );
      if (fallback) {
        injectedCodes.add(fallback.code);
        allInTiers.add(fallback.title_cn);
        result[tier] = [
          {
            industry: fallback.industry_cn,
            role_type: fallback.title_cn,
            why_fit: hintMap[tier],
            match: "中",
            match_percentage: 68,
          },
        ];
      }
    }
  }

  return result;
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // RIASEC 题答案是 Likert 1-5 数字;兴趣 tag(第19)是 Record<label,strength>
    // migrateAnswersSchema 兜底:v2 string[]、外部坏数据全部归一化
    const rawAnswers = body?.answers;
    const answers = migrateAnswersSchema(rawAnswers);

    if (Object.keys(answers).length === 0) {
      return NextResponse.json(
        { error: "answers required" },
        { status: 400 }
      );
    }

    // 第三路:补充信息(可选,向后兼容上一轮 client 不带这个字段)
    const evidence = sanitizeEvidence(body?.evidence);
    const hasResume = !!evidence;

    // Step 1 计分(规则)
    const scores = computeRIASEC(answers);
    const code = formatRIASECCode(scores);
    const confidence = computeConfidence(answers, scores);
    const interests = getSelectedInterests(answers);

    // 答得太少 — 不调 LLM
    if (confidence === "none") {
      return NextResponse.json({
        scores,
        code,
        confidence,
        positive: [],
        negative: [],
        refine_chips: [],
        disclaimer: "答得太少了,再答几道题才能给你靠谱的推荐 ~",
        completedAt: new Date().toISOString(),
      });
    }

    // Step 2 候选池(规则)
    // v6: 候选池扩到 50,让 LLM 在每大类里有 5-8 个候选选择
    const candidates = generateCandidates(scores, interests, 50);

    // Step 3 LLM 综合(deepseek-chat,jsonMode)
    const raw = await chat(
      [
        { role: "system", content: hasResume ? buildSystemPromptWithResume() : buildSystemPromptNoResume() },
        {
          role: "user",
          content: buildUserPrompt(scores, code, interests, candidates, evidence, hasResume),
        },
      ],
      {
        model: "chat",
        temperature: 0.5,
        // v6: 25 个 positive 含 why_fit ≈ 2500 tokens,留余量到 3500
        max_tokens: 3500,
        jsonMode: true,
      }
    );

    let parsed: {
      positive?: unknown;
      negative?: Array<Record<string, unknown>>;
      refine_chips?: unknown;
      rationale?: LlmRationale | null;
    };
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("LLM JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw },
        { status: 502 }
      );
    }

    // Normalize:LLM 偶尔字段错位,兜底救回
    const normalizedNegative = (parsed.negative ?? []).map((n) => ({
      industry: n.industry,
      role_type: n.role_type,
      why_consuming:
        n.why_consuming ?? n.why_bad ?? n.why ?? n.reason ?? "",
    }));


    // Process positive items: with resume → nested tiers → flatten; no resume → flat array
    let normalizedPositive: Array<Record<string, unknown>>;

    if (hasResume) {
      // LLM returns nested { now: [], needs_project: [], long_term: [] }
      let tiered: TieredPositive;
      const rawPositive = parsed.positive;
      if (rawPositive && typeof rawPositive === "object" && !Array.isArray(rawPositive)) {
        const rp = rawPositive as Record<string, unknown>;
        tiered = {
          now: Array.isArray(rp.now) ? (rp.now as PositiveRaw[]) : [],
          needs_project: Array.isArray(rp.needs_project) ? (rp.needs_project as PositiveRaw[]) : [],
          long_term: Array.isArray(rp.long_term) ? (rp.long_term as PositiveRaw[]) : [],
        };
      } else {
        // LLM returned flat array despite instruction — put all in needs_project
        const flat = Array.isArray(rawPositive) ? (rawPositive as PositiveRaw[]) : [];
        tiered = { now: [], needs_project: flat, long_term: [] };
      }
      // Guarantee at least 1 item in each tier
      tiered = guaranteeThreeTiers(tiered, candidates);
      // Flatten with employability_level for client consumption
      normalizedPositive = [
        ...tiered.now.map((p) => ({ ...p, employability_level: "now" })),
        ...tiered.needs_project.map((p) => ({ ...p, employability_level: "needs_project" })),
        ...tiered.long_term.map((p) => ({ ...p, employability_level: "long_term" })),
      ];
    } else {
      // No resume: flat array without employability_level
      // Result page detects this and shows flat view + upload-resume CTA
      normalizedPositive = Array.isArray(parsed.positive)
        ? (parsed.positive as PositiveRaw[])
        : [];
    }

        const normalizedChips = Array.isArray(parsed.refine_chips)
      ? parsed.refine_chips.filter((c): c is string => typeof c === "string")
      : [];

    // 有补充信息时,disclaimer 不再说"没看你的真实经历"
    const disclaimer = evidence
      ? `本次推荐基于测评 + 兴趣 + 你${
          evidence.source === "resume" ? "上传的简历" : "聊补充信息时说的话"
        }做三段融合。投递前请用『简历整理』模块结合具体 JD 再核对。`
      : DISCLAIMER;

    const rationale = normalizeRationale(
      parsed.rationale ?? null,
      confidence,
      scores,
      evidence
    );

    // 登录用户 → 实时写 m1_assessments（upsert by user_id）
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("m1_assessments").upsert({
          user_id: user.id,
          riasec_json: { scores, code, confidence },
          recommendation_json: {
            positive: normalizedPositive,
            negative: normalizedNegative,
            refine_chips: normalizedChips,
            rationale,
            evidence: evidence ?? null,
            disclaimer,
          },
          completed_at: new Date().toISOString(),
        });
      }
    } catch (dbErr) {
      // DB 写失败不阻断主流程
      console.warn("[m1/recommend] db upsert failed:", dbErr);
    }

    return NextResponse.json({
      scores,
      code,
      confidence,
      positive: normalizedPositive,
      negative: normalizedNegative,
      refine_chips: normalizedChips,
      rationale,
      evidence: evidence ?? null,
      disclaimer,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/recommend error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
