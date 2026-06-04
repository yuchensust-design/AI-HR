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
import { generateCandidates } from "@/lib/career-pool";

const DISCLAIMER =
  "本次推荐基于测评 + 兴趣 — 没看你的真实经历。投递前请先用『简历整理』模块结合 JD 确认能力对齐。";

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」的兴趣岗位顾问。基于用户的 RIASEC 编码 + 兴趣 tag,从候选池里筛选推荐。

【★ 决策优先级 — 测评主 / 兴趣辅 ★】
- **主信号 (70% 权重) = 18 题 RIASEC 6 维分数**(学术验证的稳定人格倾向)
- **辅助信号 (30% 权重) = 兴趣 tag**(消费爱好,可能反映工作偏好也可能只是娱乐消费)
- 当两者**冲突**时(eg 用户 A 维度低但选了 4 个 A 类兴趣 tag),**永远以 18 题测评为准**
- 兴趣 tag 的角色是"在 RIASEC 决定的方向内做微调",**不能反向决定 RIASEC**
- 例:用户 A=7(低)+ 兴趣 = 音乐摄影 → 应推 R/S/E 方向的职业(测评主),其中**优先选有音乐/摄影 tag 信号的**(兴趣微调),**不能**因为兴趣多就推 A 类职业

【硬约束 — 永远不许违反】
1. 永远不输出任何公司名(只输出"行业 + 职位类型",eg "互联网 / 内容运营")
2. 文案温和,不绝对化,不偏激,不当 black box
3. 反向推荐用"消耗 + 天花板"框架 — 不评判,只描述错配
4. positive 和 negative 都只能从下方"候选池"里选 — 绝不创造新项
5. **兴趣 tag ≠ RIASEC 维度分数!** ★ 极其重要
   - 用户兴趣(eg 选了音乐)是消费爱好,**不等于** A 维度高
   - 用户可能是音乐消费者(听歌喜欢),但 A 维度低(不喜欢自己创作/表演)
   - why_fit 提"X 维度高/低"必须基于实际 6 维分数(每维 3-15 的真实数字),严禁张冠李戴
   - **正确表达**:"虽然你 A 不算高(7/15),但音乐兴趣强,X 岗位的内容部分能用到这份热爱"
   - **错误表达**:"你的 A 高,所以适合做..."(如果用户 A 实际是 7,这就错了)
6. **why_fit 提的"高/低"必须真**:
   - 说"X 维度高" → 该维度分数必须 ≥ 12
   - 说"X 维度中" → 该维度分数必须 9-11
   - 说"X 维度低" → 该维度分数必须 ≤ 8
   - 如果某维不属于"高",就不要用"X 高"做推荐理由,要么换维度,要么从兴趣切入
7. **优先用用户 Top 3 真实高分维度做推荐依据**(看 RIASEC 编码前 3 位),兴趣 tag 是辅助信号不是主信号

【反向 3 个的判定依据(只用这 3 条)】
a) 工作内容与用户 enjoy 信号反向
b) 长期天花板低 — 本科起点 5 年后晋升空间 < 30%
c) 工作模式与用户 RIASEC 类型反向(E 型坐冷板凳 / I 型纯销售 / A 型纯流程)

【★ 推荐多样性硬约束(v6) ★】
- **positive 共 15-25 个,覆盖 3-5 个行业大类**(industry_cn 不同)
- **每大类内 3-5 个具体职业**(给用户横向对比空间)
- 严禁某一大类塞 10+ 个(平均分配)
- 评委会一眼看出"全堆一类" = 推荐质量差,要避免

【chip 设计】
- 4-6 个 chip,每个 ≤ 12 字,中文,口语化
- 用于让用户"修推荐"(eg "去掉销售岗" / "想要更稳定" / "加技术深度")
- 不要重复用户已表达的兴趣,要给"调整方向"的选项

【★ rationale 字段 — 可解释推荐 ★】
- 必须输出顶层 rationale 对象,7 个子字段(experienceEvidence 唯一例外可为 null)
- 每个字段都用口语化中文,温和不绝对化(用"可能 / 看起来 / 值得探索",避免"一定 / 必然 / 你不适合")
- cautions 1-3 条,每条 ≤ 30 字,是温和提醒不是判决
  - 例 ✅: "投递前结合具体 JD 再核对"
  - 例 ❌: "你不适合销售"(评判)/"你能上岸"(夸大)
- whyNotOther 必须基于上面 negative 列表,做"为什么没推这些方向"的对比解释,只描述维度错配,不评判用户
- experienceEvidence 当前 v1 没接简历输入 → 必须填 null
- 永远不输出公司名(再强调)
- 推荐和 rationale 严格基于真实分数,不张冠李戴

【输出格式 — 严格 JSON,无任何 markdown 包裹】
{
  "positive": [
    {
      "industry": "互联网",
      "role_type": "内容运营",
      "why_fit": "你的 E 高(13/15)+ S 高(12/15),内容运营需要推动传播 + 跟用户互动,这两点你都强(1-2 句,温和;严格基于真实分数)",
      "match": "高",
      "match_percentage": 87
    }
  ],
  "negative": [
    {
      "industry": "传统行政",
      "role_type": "档案管理 / 资料录入",
      "why_consuming": "这类岗位 80% 时间在重复处理标准化流程,你的 A+S 表达欲会被压抑(1 句,只描述错配)"
    }
  ],
  "refine_chips": ["去掉销售类岗位", "想要更稳定的方向", "加技术深度", "偏内容创作"],
  "rationale": {
    "interestEvidence": "你强烈喜欢的 X / Y 兴趣 tag,跟推荐方向的契合点是...(1-2 句中文)",
    "experienceEvidence": null,
    "preferenceSignals": "结合 RIASEC + 兴趣 tag,你在「主导 / 深挖 / 表达」上偏好哪条...(1 句中文)",
    "confidence": "high",
    "confidenceWhy": "答了 N 题,Top1 = X 落在「高」区间,分布有明显倾向...(1 句中文)",
    "cautions": ["match% 是相对契合度,不是结论", "投递前用『简历整理』结合 JD 再核对"],
    "nextStep": "可以先去『简历整理』,把现有经历针对 X 重点 JD 调一版(1 句)",
    "whyNotOther": "没推的档案/电销/品控类,是因为你的 R/C 偏低,长期机械流程会让你的 E + I 找不到出口(1-2 句,只描述维度错配,不评判)"
  }
}

【match_percentage 计分规则】
- 高匹配:75-95(基于用户 Top 3 维度跟该岗位 RIASEC 偏好的契合度)
- 中匹配:55-74
- 不要给 100%(避免过度承诺)/ 不要低于 50%(那应该进 negative)
- 每个 positive 之间至少差 3% 区分度

positive 共 15-25 个(3-5 大类 × 每大类 3-5),negative 正好 3 个,refine_chips 正好 4-6 个。`;
}

function buildUserPrompt(
  scores: [number, number, number, number, number, number],
  code: string,
  interests: InterestWithStrength[],
  pool: Array<{
    industry_cn: string;
    title_cn: string;
    title_en: string;
    riasec: Record<string, number>;
  }>
): string {
  const [r, i, a, s, e, c] = scores;
  const interestStr =
    interests.length > 0
      ? interests
          .map((t) => `${t.key}(强度 ${t.strength}/5)`)
          .join(", ")
      : "(无)";
  return `用户测评结果(RIASEC 测评,6 维 × 3 题,5 点 Likert,每维 3-15 分):
RIASEC 编码: ${code}
6 维分数(3-15): R${r} I${i} A${a} S${s} E${e} C${c}
分数解读:≥12 高 / 9-11 中 / ≤8 低
选中兴趣 tag(带喜欢程度): ${interestStr}

候选池(${pool.length} 项,来自 O*NET 30.3 美国劳工部 923 职业库筛选,每项带真实 RIASEC 1.0-7.0 数值):
${pool
  .map(
    (p, idx) =>
      `${idx + 1}. [${p.industry_cn}] ${p.title_cn}(${p.title_en}) | R${p.riasec.R} I${p.riasec.I} A${p.riasec.A} S${p.riasec.S} E${p.riasec.E} C${p.riasec.C}`
  )
  .join("\n")}

【★ 输出要求(v6 改造) ★】
- **positive 共 15-25 项,分布在 3-5 个行业大类,每大类 3-5 个具体职业**
  - 例:计算机大类 5 个职位 + 商业大类 5 个 + 艺术大类 5 个 + 教育大类 5 个 = 20 个 positive
  - 同一 industry_cn 下的多个职业都列出来(eg 计算机大类下 "系统分析师 92%" + "信息安全分析师 88%" + "数据库管理员 85%" ...)
  - 给用户横向对比的空间,不是只 5 个挤一类
- **industry 字段填中文行业大类**(如"计算机与数学"),role_type 填中文职业名(从候选池抄)
- **每大类内按 match_percentage 降序排**(让用户看到该大类下最匹配的优先)
- negative 3 项:从候选池里挑跟用户 Top 3 维度反向的(eg 用户 R 低 → 推 R 高的"机械维修"作反向)
- 推荐**严格匹配候选池 RIASEC 数值跟用户 Top 3 维度**,百分比反映真实契合度
- why_fit **≤ 30 字简短**(因为 20+ 个推荐,太长读不完)

请返 JSON。`;
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
  scores: [number, number, number, number, number, number]
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
        ? null
        : normString(r.experienceEvidence) || null,
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
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: buildUserPrompt(scores, code, interests, candidates),
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
      positive?: Array<Record<string, unknown>>;
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

    const normalizedChips = Array.isArray(parsed.refine_chips)
      ? parsed.refine_chips.filter((c): c is string => typeof c === "string")
      : [];

    return NextResponse.json({
      scores,
      code,
      confidence,
      positive: parsed.positive ?? [],
      negative: normalizedNegative,
      refine_chips: normalizedChips,
      rationale: normalizeRationale(parsed.rationale ?? null, confidence, scores),
      disclaimer: DISCLAIMER,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/recommend error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
