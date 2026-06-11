/**
 * POST /api/m4/analyze-gaps — 模块 4 · 专用深度 gap 分析(两步管道第①步)
 *
 * 比 M3 parse-jd 的关键词级 gaps 更深:逐条判定简历"已具备/部分/缺失"并引用原文,
 * 给每条 gap 打 impact(对拿 offer 多关键)× 各时间档可补度,产出可见、可勾选的差距报告。
 * "没分析好后面都白搭" —— 这一步是补项目推荐的地基。
 *
 * Body 2 选 1:
 *   { mode: "full", jdText, parsedResume }              完整 JD(最准)
 *   { mode: "role", roleName, company?, parsedResume }  只有岗位名(行业通用推断,标注 generic)
 *
 * 返回 GapReport(见 lib/m4-types.ts):
 *   { overall_fit, matched[], gaps[], summary }
 *
 * 硬约束:
 *   - current_coverage / evidence 必须引用简历真实内容判定,不脑补
 *   - matched(已具备)单列出来 → 推荐步不会浪费预算补已有能力
 *   - jd 输出层脱敏公司名(沿用 M3 口径)
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import type { GapReport, GapCoverage, ScoredGap, BridgeFit } from "@/lib/m4-types";

// 线上防 Vercel 默认 10s 静默超时(Hobby 上限 60s)
export const maxDuration = 60;

const MAX_JD_LEN = 8000;

// —— C:真 JD grounding —— 无 JD(role 模式)时,拉几条真实在招岗位当「市场要求样本」,
// 把 LLM 的"拍脑袋通用推断"升级成"真实市场要求"。隧道断/超时 → 返回 null,静默回退现状 generic。
const CRAWLER_BASE_URL = process.env.CRAWLER_BASE_URL ?? "http://localhost:3030";
const CRAWLER_API_KEY = process.env.CRAWLER_API_KEY ?? "dev-secret-change-me";

type CrawlerJob = {
  title?: string;
  company?: string;
  companyType?: string;
  city?: string;
  experience?: string;
  salary?: string;
  tags?: string[];
  jdSummary?: string;
  description?: string;
};

/**
 * 拉 3-5 条真实在招岗位,拼成市场样本文本。
 * 只用真爬虫结果;mock/失败/超时一律返回 null(绝不拿 mock 冒充真实市场)。
 */
async function fetchMarketJDSample(
  roleName: string,
  city: string | undefined,
): Promise<string | null> {
  try {
    const upstream = await fetch(`${CRAWLER_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": CRAWLER_API_KEY,
      },
      body: JSON.stringify({
        role: roleName,
        city: city || "上海",
        page: 1,
        limit: 6,
      }),
      // 给 grounding 留 ~12s,留足时间给后面的 LLM 分析(总预算 60s)
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.ok) return null;
    const data = (await upstream.json()) as {
      jobs?: CrawlerJob[];
      isMock?: boolean;
    };
    if (data.isMock) return null; // mock 不算真实市场样本
    const jobs = Array.isArray(data.jobs) ? data.jobs.slice(0, 5) : [];
    if (jobs.length === 0) return null;
    const lines = jobs.map((j, idx) => {
      const meta = [j.companyType || j.company, j.experience, j.salary]
        .filter(Boolean)
        .join(" / ");
      const body =
        (j.jdSummary || j.description || "").trim() ||
        (Array.isArray(j.tags) ? j.tags.join("、") : "");
      return `${idx + 1}. ${j.title ?? "(岗位)"}${meta ? `（${meta}）` : ""}：${body}`;
    });
    return lines.join("\n");
  } catch {
    return null; // 隧道不可达 / 超时 → 回退现状
  }
}

function buildSystemPrompt(mode: "full" | "role", hasMarketSample = false): string {
  const modeNote =
    mode === "full"
      ? "用户提供了完整 JD 文本,高保真拆解;confidence 视为 high。"
      : hasMarketSample
        ? "用户没给 JD,但已附上该岗位**真实在招样本**(实时招聘数据)。请优先据此拆解关键能力要求,比通用推断更贴近市场。"
        : "用户只给了岗位名(可能含公司名),用行业通用知识推断该岗位常见要求,**明示这是 generic / 非 JD-specific**。";

  return `你是「Offer 捕手」模块 4 的能力差距分析师。你的任务:把用户简历和目标岗位逐条对照,产出一份**诚实、可解释**的差距报告,供后续按时间预算设计补强方案。

【模式】
${modeNote}

【分析方法 — 必须严格执行】
1. 先从目标岗位拆出 6-12 条关键能力要求(硬技能 / 工具 / 方法 / 领域 / 关键职责)。
2. 逐条对照用户简历,判定 current_coverage:
   - "have" = 简历有明确证据(写出是简历哪段)
   - "partial" = 沾边但不够(说清差在哪)
   - "none" = 简历完全没有
   **evidence 必须引用简历或 JD 的真实内容,不许脑补用户没写的经历。**
3. 已具备(have)的要求放进 matched[],不要当成 gap。
4. 缺口(none / partial)放进 gaps[],每条打:
   - impact 1-5:这条对拿到这个 offer 多关键(must-have 给 4-5,加分项给 2-3)
   - fixable_in:在 sprint(3-7天)/ standard(2-4周)/ deep(1-2月+)各档内,**靠补强能不能拿出可信证据**
     · sprint 内通常只能"补概念/入门",做不出项目级证据的硬技能,sprint=false
     · 需要长期积累或真实环境的(如"3年带团队"),三档可能都 false → 诚实标 false
5. overall_fit 1-5:简历对这个岗位的整体匹配度(5=可直接投,1=差距很大)。
6. summary:2-4 句,点明最该补的 1-2 个方向 + 诚实提醒(若高 impact 缺口短期补不了,直说)。
7. bridge_fit:判定这个岗位适不适合用"一个人在家能独立做完、能写进简历的项目"来补强,三选一:
   - "covered" = 岗位明确属于这 6 类之一:AI产品经理 / 软件开发工程师 / 数据科学·算法·ML / 市场·增长·营销运营 / 设计(UX·产品·视觉) / 销售·BD。
   - "hands_on" = 硬证据必须来自**真实实验室/临床/产线/现场/设备**,独立数字项目替代不了:如化学·生物·材料实验、医护·临床·药剂、制造·工艺、土木·建筑施工、机械·硬件调试、食品检验、护理等。
   - "digital" = 其余知识/数字类岗位(如运营变体、咨询、金融分析、法律、财会、HR、教研、写作等)——不在那 6 类库内,但仍可用独立数字项目补强。
   判定从严:只有清楚属于 6 类才给 "covered";拿不准用 "digital";确属动手/实验/临床/现场才给 "hands_on"。

【反编造 — 永不违反】
- 不替用户编造简历里没有的经历来判 have/partial
- 不承诺"补了就一定行";fixable_in 是"能不能拿出可信证据",不是"保证达标"
- jd 相关输出层脱敏公司名(简历里用户自己写的公司名可保留)

【输出 — 严格 JSON,无 markdown 包裹】
{
  "overall_fit": 1-5,
  "matched": [ { "jd_requirement": "...", "resume_evidence": "简历哪段证明的" } ],
  "gaps": [
    {
      "jd_requirement": "岗位要的能力",
      "current_coverage": "none" | "partial" | "have",
      "evidence": "判定依据(引用简历/JD)",
      "why_matters": "为什么这条重要 ≤40字",
      "impact": 1-5,
      "fixable_in": { "sprint": true|false, "standard": true|false, "deep": true|false }
    }
  ],
  "summary": "2-4 句,含诚实提醒",
  "bridge_fit": "covered" | "digital" | "hands_on"
}
返 JSON。`;
}

// 用户从「改简历」的某个 JD 关键词缺口点「补项目」进来时,带着这个关键词 —— 差距报告必须优先覆盖它
function focusBlock(focusGap: string): string {
  if (!focusGap) return "";
  return `\n用户是专门为补强「${focusGap}」这项能力而来(从改简历里识别出的真实缺口)。
请确保差距报告里**包含「${focusGap}」相关的缺口项,并放在最前面**;围绕它给出可落地的补强方向。\n`;
}

function buildUserPromptFull(
  jdText: string,
  parsedResume: unknown,
  focusGap: string,
): string {
  return `目标 JD 文本:
---JD 开始---
${jdText}
---JD 结束---
${focusBlock(focusGap)}
用户简历(结构化):
${JSON.stringify(parsedResume, null, 2)}

返 JSON。`;
}

function buildUserPromptRole(
  roleName: string,
  company: string | undefined,
  parsedResume: unknown,
  marketSample: string | null,
  focusGap: string,
): string {
  const marketBlock = marketSample
    ? `\n以下是该岗位**当前真实在招的样本**(来自实时招聘数据,已脱敏公司名),请优先据此拆解关键能力要求,比通用推断更贴近市场:
---真实在招样本开始---
${marketSample}
---真实在招样本结束---
`
    : "\n(暂无真实在招样本,请基于行业通用知识推断该岗位常见要求,明示 generic、非 JD-specific。)";

  return `用户没给完整 JD,只说目标岗位:
- 岗位名: ${roleName}
${company ? `- 公司: ${company}` : "- 公司: (未指定)"}
${marketBlock}
${focusBlock(focusGap)}
用户简历(结构化):
${JSON.stringify(parsedResume, null, 2)}

返 JSON。jd 相关输出不含公司名。`;
}

// —— 输出层脱敏(prompt 已强约束,这里兜底)——
const SENSITIVE = [
  "字节跳动", "字节", "腾讯", "阿里巴巴", "阿里", "美团", "百度", "京东",
  "拼多多", "网易", "小米", "华为", "OPPO", "vivo", "滴滴", "快手", "蚂蚁",
  "Tencent", "Alibaba", "ByteDance",
];
function scrub(s: string): string {
  let out = s;
  for (const w of SENSITIVE) out = out.replaceAll(w, "某大厂");
  return out;
}

// —— normalize ——
const COVERAGES: GapCoverage[] = ["none", "partial", "have"];
function clampScore(n: unknown): 1 | 2 | 3 | 4 | 5 {
  const v = Math.round(Number(n));
  return (Math.max(1, Math.min(5, Number.isFinite(v) ? v : 3)) as 1 | 2 | 3 | 4 | 5);
}
function normalizeGap(g: Record<string, unknown>): ScoredGap {
  const cov = COVERAGES.includes(g.current_coverage as GapCoverage)
    ? (g.current_coverage as GapCoverage)
    : "none";
  const fx = (g.fixable_in ?? {}) as Record<string, unknown>;
  return {
    jd_requirement: scrub(String(g.jd_requirement ?? "")),
    current_coverage: cov,
    evidence: String(g.evidence ?? ""),
    why_matters: scrub(String(g.why_matters ?? "")),
    impact: clampScore(g.impact),
    fixable_in: {
      sprint: !!fx.sprint,
      standard: !!fx.standard,
      deep: !!fx.deep,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body.mode as string;

    if (mode !== "full" && mode !== "role") {
      return NextResponse.json(
        { error: "mode must be 'full' or 'role'" },
        { status: 400 },
      );
    }

    const parsedResume = body.parsedResume;
    if (!parsedResume) {
      return NextResponse.json(
        { error: "parsedResume required(请先解析简历)" },
        { status: 400 },
      );
    }

    const focusGap = String(body.focusGap ?? "").trim().slice(0, 60);

    let userPrompt: string;
    let hasMarketSample = false;
    if (mode === "full") {
      const jdText = String(body.jdText ?? "").trim();
      if (!jdText) {
        return NextResponse.json(
          { error: "jdText required for mode=full" },
          { status: 400 },
        );
      }
      if (jdText.length > MAX_JD_LEN) {
        return NextResponse.json(
          { error: `JD 过长(> ${MAX_JD_LEN} 字)` },
          { status: 400 },
        );
      }
      userPrompt = buildUserPromptFull(jdText, parsedResume, focusGap);
    } else {
      const roleName = String(body.roleName ?? "").trim();
      if (!roleName) {
        return NextResponse.json(
          { error: "roleName required for mode=role" },
          { status: 400 },
        );
      }
      const company = body.company ? String(body.company).trim() : undefined;
      const city = body.city ? String(body.city).trim() : undefined;
      // grounding 策略:
      //  - focusGap(从改简历缺口带来)→ 专注、对齐改简历口径,不搜真岗(避免岗位无关噪声)
      //  - skipMarketSearch(用户在补项目里显式选「AI 按岗位知识推断」)→ 不搜真岗
      //  - 其余(老路径/未指定)→ 拉真实在招样本 grounding(失败静默回退通用推断)
      //  注:用户若选「用真实在招岗位」,前端会让其挑一条岗位、以 mode=full 传该岗 JD,不走这里。
      const skipMarketSearch = body.skipMarketSearch === true;
      const marketSample =
        focusGap || skipMarketSearch
          ? null
          : await fetchMarketJDSample(roleName, city);
      hasMarketSample = !!marketSample;
      userPrompt = buildUserPromptRole(roleName, company, parsedResume, marketSample, focusGap);
    }

    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt(mode, hasMarketSample) },
        { role: "user", content: userPrompt },
      ],
      { model: "chat", temperature: 0.3, max_tokens: 3000, jsonMode: true },
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[m4/analyze-gaps] JSON parse failed:", raw.slice(0, 500));
      return NextResponse.json(
        { error: "差距分析返回格式异常,请重试", raw: raw.slice(0, 500) },
        { status: 502 },
      );
    }

    const matched = Array.isArray(parsed.matched)
      ? (parsed.matched as Record<string, unknown>[]).map((m) => ({
          jd_requirement: scrub(String(m.jd_requirement ?? "")),
          resume_evidence: String(m.resume_evidence ?? ""),
        }))
      : [];
    const gaps = Array.isArray(parsed.gaps)
      ? (parsed.gaps as Record<string, unknown>[])
          .map(normalizeGap)
          .filter((g) => g.jd_requirement)
      : [];

    const BRIDGE_FITS: BridgeFit[] = ["covered", "digital", "hands_on"];
    const bridge_fit: BridgeFit = BRIDGE_FITS.includes(
      parsed.bridge_fit as BridgeFit,
    )
      ? (parsed.bridge_fit as BridgeFit)
      : "digital"; // 拿不准时按"库外数字岗"兜底(生成但标中等可靠),不冒充 covered

    const report: GapReport = {
      overall_fit: clampScore(parsed.overall_fit),
      matched,
      gaps,
      summary: scrub(String(parsed.summary ?? "")),
      bridge_fit,
    };

    if (gaps.length === 0 && matched.length === 0) {
      return NextResponse.json(
        { error: "没分析出有效结果,请检查简历/JD 后重试" },
        { status: 502 },
      );
    }

    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[m4/analyze-gaps] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
