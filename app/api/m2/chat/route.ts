/**
 * POST /api/m2/chat — 模块 2「挖经历」对话(v2.2 重构,plan 09 §0.7)
 *
 * 三段轻流程:spread(铺开记忆唤醒)→ illuminate(逐段认领点亮)→ wrap(收口出 bullet)。
 * 核心交互 = 认领式多选(用"识别"代替"凭空回忆")+ 结构化 reframe(点亮长尾隐藏价值)。
 *
 * 架构(Alt-1 判定/生成分离):
 *   - LLM 单次调用 = 生成(say + ask + delta_*)
 *   - 充足度 / 收口 / bullet 主键 = 后端规则判定(不靠 LLM 自评 → 解 🔴-2 / 可观测)
 *
 * 反虚构(harness 实测坐实):未陈述效果→【请补充效果】;只给主题→【请补充具体职责】;
 *   reframe 只给已陈述事实贴能力标签,不新增行为/规模/影响。
 *
 * Body: { history, persona_tag?, depth?, current_intake, current_bullets, intent? }
 *   intent: "depth_change_up" | "depth_change_down" 时只重判收敛 / 注入一个追问。
 * 返回: { say, ask, phase, delta_roles, delta_stories, delta_bullets, suggest_wrap, done, reason? }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat, type ChatMessage } from "@/lib/llm";
import {
  OPTION_SETS,
  REFRAME_RULES,
  DEPTH_ANCHORS,
  type OptionItem,
} from "@/lib/prompts/excavate-options";

// Vercel:LLM 调用 >10s 默认会 504,显式拉到 60s(plan memory 教训)
export const maxDuration = 60;

type Phase = "spread" | "illuminate" | "wrap";
type Depth = "shallow" | "medium" | "deep";

type StoryCategory =
  | "Peak" | "Challenge" | "Impact" | "Failure" | "LearningSprint" | "Praise";

type IntakeRole = {
  org_type: string;
  role: string;
  period: string;
  charter: string;
  scale?: string;
  excavation_depth: "shallow" | "medium" | "deep" | "thin";
};

// story 层 STAR 保持长名(plan 修 N:不改 buildResumeMarkdown / diary 依赖)
type IntakeStory = {
  id: string;
  title: string;
  category: StoryCategory;
  strength: 1 | 2 | 3 | 4 | 5;
  star: { situation: string; task: string; action: string; result: string };
  earned_secret?: string;
  jd_keywords?: string[];
};

type IntakeArtifact = {
  roles: IntakeRole[];
  stories: IntakeStory[];
  skeptical_flags?: { weak_spot: string; story_id?: string }[];
};

type Sufficiency = "thin" | "draftable" | "strong";

// bullet 层 STAR 用 {s,t,a,r}(现有字段名 star_breakdown,plan 修 L3/N)
type CandidateBullet = {
  id: string;
  source_story_id?: string;
  source_category?: string; // = option_set key(用于素材台按类型分组)
  text: string;
  star_breakdown?: { s: string; t: string; a: string; r: string };
  competency?: string;
  sufficiency: Sufficiency; // 后端规则判定
  depth_met: boolean; // 后端按旋钮档位判定
  anti_fab_note?: string;
  hidden_value?: boolean;
};

function isAmbitiousPersona(persona?: string): boolean {
  if (!persona) return false;
  const p = persona.toLowerCase();
  return (
    p.includes("chen") || p.includes("陈昊") ||
    p.includes("ambitious") || p.includes("拔高")
  );
}

// ============ 三段相位推导(替代旧 guessPhase 5 阶段) ============
function derivePhase(
  intake: IntakeArtifact,
  bullets: CandidateBullet[],
  suggestWrap: boolean,
): Phase {
  const hasMaterial =
    (intake.roles?.length ?? 0) > 0 || (intake.stories?.length ?? 0) > 0 ||
    bullets.length > 0;
  if (!hasMaterial) return "spread";
  if (suggestWrap) return "wrap";
  return "illuminate";
}

// ============ 充足度规则判定(Alt-1:判定归后端,不靠 LLM 自评) ============
function gradeBullet(text: string): Sufficiency {
  if (!text || text.trim().length < 8) return "thin";
  if (/【请补充具体职责】/.test(text)) return "thin"; // 只给主题没动作
  const stripped = text.replace(/【[^】]*】/g, "");
  const hasNumber = /[0-9０-９]/.test(stripped);
  return hasNumber ? "strong" : "draftable";
}

function depthMet(s: Sufficiency, text: string, depth: Depth): boolean {
  if (depth === "shallow") return s !== "thin";
  if (depth === "medium")
    return s === "strong" || /【请补充[^】]*】/.test(text); // 量化已尝试(填了或占位)
  return s === "strong"; // deep:要有真实量化
}

// 稳定主键:${competency-slug}#${role-slug}#${textHash}(plan 修 H3/H9,后端拼非 LLM 复现)
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 6);
}
function slug(s: string): string {
  return (s || "x").replace(/[\s·/]+/g, "-").slice(0, 12);
}
// 稳定 id:按 来源类目 + 来源故事 + 能力 — **不含 textHash**(补数字后文本变也仍是同一条,可 upsert,修去重 bug)
function makeBulletId(b: { competency?: string; source_story_id?: string; source_category?: string; text: string }): string {
  const key = [slug(b.source_category ?? ""), slug(b.source_story_id ?? ""), slug(b.competency ?? "")]
    .filter(Boolean).join("#");
  return key || `b-${shortHash(b.text)}`;
}

// ============ prompt 资产(从 excavate-options 派生,plan 修 C) ============
const OPTION_SET_KEYS = Object.keys(OPTION_SETS).join(" / ");
const OPTION_SET_SUMMARY = Object.values(OPTION_SETS)
  .map((os) => `- ${os.key}:${os.options.map((o: OptionItem) => o.label).join(" / ")}`)
  .join("\n");
const REFRAME_SUMMARY = REFRAME_RULES
  .map((r) => `- 命中「${r.trigger.source}」→ 贴标签「${r.competency}」+ 追问「${r.probe}」`)
  .join("\n");

function buildDepthBlock(depth: Depth): string {
  if (depth === "shallow")
    return `【深度:浅(默认)】每段经历认 1 次动作多选 + 给 1 次轻量量化抓手即可成稿;答不出量化用占位,不二次纠缠。攒够 3 条可用 bullet 就提议收口。`;
  if (depth === "deep")
    return `【深度:深】每段经历多追量化维度(规模/产出/效果/频率),尽量补全 STAR;可选追"有没有反直觉的收获"。不强求,答不出仍占位收口。`;
  return `【深度:中】认领后追 1-2 个量化/影响维度。答不出用占位,不卡死。`;
}

function buildSystemPrompt(args: {
  persona?: string;
  depth: Depth;
  intent?: string;
}): string {
  const { persona, depth, intent } = args;
  const ambitious = isAmbitiousPersona(persona);

  const personaBlock = ambitious
    ? `【用户画像:拔高型】已有大厂实习 / 扎实经历。**不要用认领多选卡**(对他降智);用开放问法直接挖 charter / 规模 / 量化成果,角色是 polish 不是翻译。ask.type 一律用 "open"。`
    : `【用户画像:零经历友好(默认)】面对"自己都觉得做过的事不起眼"的迷茫学生。核心 = 用"认领"代替"凭空回忆":优先给认领式多选(ask.type="multi_select" + option_set),让他认出做过哪些,而不是开放问"你做了啥"。`;

  const intentBlock =
    intent === "depth_change_down"
      ? `\n【本轮意图:用户把深度调低】不要再追问,直接基于现有素材收口:say 简短确认 + suggest_wrap=true,ask 置 null。`
      : intent === "depth_change_up"
      ? `\n【本轮意图:用户把深度调高】挑现有最弱的一条 bullet,**只追 1 个**能让它变强的量化/细节问题(open 或相关 option_set);不要重复已问过的。`
      : "";

  return `你是「Offer 捕手」的"挖经历"助手。帮没简历 / 经历散乱的学生,把零散经历挖成可直接写进简历的 bullet,产出给下游"简历整理"消费。

${personaBlock}

${buildDepthBlock(depth)}${intentBlock}

【认领多选用法(非拔高型)】
- 可用 option_set(key):${OPTION_SET_KEYS}
- 每类覆盖的动作(你只需返回 option_set 的 key,具体选项由系统渲染):
${OPTION_SET_SUMMARY}
- 用户选了"以上都不是 / 我做的是别的"或自由描述 → 用下面的 reframe 规则,贴标签 + 用相邻类目追问(不要甩空输入框):
${REFRAME_SUMMARY}

【产出节奏(关键)】
- 用户**每认领一次**,**当轮就产 1 条草稿 bullet**放进 delta_bullets(数字/效果先用占位),让素材台即时增长 —— 不要憋着等数字齐了才产
- 然后 say 里**追 1 次**量化(见下)

【尽量量化(主动但轻)】
- 认领动作后,主动给"一次"轻量量化抓手 + 量级锚点,让他认/估:"大概帮了几个人?更接近 10 还是 100?"
- 答得出 → 更新那条 bullet;答不出 → 内联占位(如"覆盖【请补充】名同学"),**不卡死、不催第二遍**(深档才多追)

【ask 与 say 必须一致(别自相矛盾)】
- say 在追一个开放问题(多少人 / 什么成果 / 主导还是参与)→ ask.type="open"、prompt 填该问题(或 ask 省略让用户自由答)
- 只有当你要引导用户认领**新一类**经历时,才用 ask.type="multi_select" + 对应 option_set
- **绝不连续两轮弹同一个 option_set**(用户已认领过的类不要再弹同一张卡)

【铁律 — 反虚构(违反即失败)】
1. 只能用用户"勾选"或"明确说出"的事实;绝不新增没说的行为 / 规模 / 数字 / 成果
2. 未知数字 → 内联【请补充】占位;**未陈述的效果/影响**(提升成绩 / 提高满意度 / 帮助通过)→【请补充效果】,绝不替他断言效果
3. **只给主题没给动作**(如"做过 X 课题")→ 写"参与 X,具体负责【请补充具体职责】"+ 追问,**绝不脑补做了什么**
4. reframe = 只给"已陈述事实"贴能力标签(批改作业→评估能力);贴标签的 bullet 标 anti_fab_note:"标签推断,非用户新述"
5. **永远不输出任何公司 / 学校 / 具名组织**(抽象到"某互联网大厂 / 某高校实验室 / 某公益组织")
6. 高加分类动作(出题 / 带队 / 负责 / 主导)被认领后,先轻确认"这块你是主导还是参与?",据答调措辞,不默认"主导/牵头"
7. 一 turn 一问;不空洞夸赞("great / amazing");say 暖、短、口语

【输出 — 严格 JSON,无 markdown 包裹】
{
  "say": "你这轮要说的话(可含一次量化抓手或 reframe 点亮)",
  "ask": {
    "type": "multi_select | open",
    "prompt": "问法(认领多选时是'这段X你做过哪些?')",
    "option_set": "multi_select 时填上面的 key 之一;open 时省略"
  },
  "delta_roles": [ { "org_type":"行业(非公司名)", "role":"", "period":"", "charter":"", "scale":"", "excavation_depth":"shallow|medium|deep|thin" } ],
  "delta_stories": [ { "id":"S001", "title":"", "category":"Peak|Challenge|Impact|Failure|LearningSprint|Praise", "strength":1, "star":{"situation":"","task":"","action":"","result":""}, "earned_secret":"" } ],
  "delta_bullets": [ { "source_story_id":"S001", "source_category":"当前在挖的 option_set key(如 club/teaching,用于分组)", "text":"可直接写进简历的句子(未知用占位)", "star_breakdown":{"s":"","t":"","a":"","r":""}, "competency":"能力标签", "anti_fab_note":"草稿待补 / 标签推断", "hidden_value": false } ],
  "done": false,
  "reason": "done=true 时一句话总结"
}

字段说明:
- delta_* 只放本轮新增/修正项;没有就空数组。roles 用 by(role+period) 语义、stories 用 id 复用(系统会 upsert)
- bullet 不要自己判 sufficiency/id(系统按规则算);你只管产出真实、平实、可背诵的 text + competency
- 参考成稿质感(中档锚例):${DEPTH_ANCHORS.medium[0]}`;
}

// ============ user prompt ============
function buildUserPrompt(args: {
  history: ChatMessage[];
  current_intake: IntakeArtifact;
  current_bullets: CandidateBullet[];
}): string {
  const historyStr =
    args.history.length === 0
      ? "(空 — 第一轮,用户还没说话,请用 spread:暖场 + 给一个认领多选 option_set 起步)"
      : args.history.map((m, i) => `[${i + 1}] ${m.role}: ${m.content}`).join("\n");
  // topics 从已有 roles/stories 现场推导回喂(plan 修 H4),供 LLM 去重
  const topics = [
    ...(args.current_intake.roles ?? []).map((r) => r.role),
    ...(args.current_intake.stories ?? []).map((s) => s.title),
  ].filter(Boolean);
  return `【对话历史(${args.history.length} 条)】
${historyStr}

【已覆盖话题(别重复问)】
${topics.length ? topics.join(" / ") : "(无)"}

【当前已挖 roles/stories】
${JSON.stringify(args.current_intake, null, 2).slice(0, 3000)}

【当前候选 bullets】
${JSON.stringify(args.current_bullets.map((b) => ({ text: b.text, competency: b.competency, sufficiency: b.sufficiency })), null, 2).slice(0, 2000)}

给出下一轮 JSON。`;
}

// ============ 归一化 ============
function normalizeRole(r: unknown): IntakeRole | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const dRaw = (o.excavation_depth as string) ?? (o.depth as string) ?? "shallow";
  const depth = (["shallow", "medium", "deep", "thin"].includes(dRaw) ? dRaw : "shallow") as IntakeRole["excavation_depth"];
  const role = (o.role as string) ?? (o.position as string) ?? "";
  if (!role) return null;
  return {
    org_type: (o.org_type as string) ?? (o.orgType as string) ?? (o.org as string) ?? "",
    role,
    period: (o.period as string) ?? (o.time as string) ?? "",
    charter: (o.charter as string) ?? (o.responsibility as string) ?? "",
    scale: (o.scale as string) ?? undefined,
    excavation_depth: depth,
  };
}

const VALID_CATEGORIES: StoryCategory[] = ["Peak", "Challenge", "Impact", "Failure", "LearningSprint", "Praise"];
function normalizeStory(s: unknown): IntakeStory | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  const cat = (o.category as string) ?? (o.type as string) ?? "Impact";
  const category = (VALID_CATEGORIES.includes(cat as StoryCategory) ? cat : "Impact") as StoryCategory;
  const strength = Math.max(1, Math.min(5, Math.round(Number(o.strength ?? o.rating ?? 3)))) as 1 | 2 | 3 | 4 | 5;
  const star = (o.star ?? {}) as Record<string, unknown>;
  const title = (o.title as string) ?? (o.name as string) ?? "";
  if (!title) return null;
  return {
    id: (o.id as string) ?? (o.story_id as string) ?? `S${shortHash(title)}`,
    title,
    category,
    strength,
    star: {
      situation: (star.situation as string) ?? (o.situation as string) ?? "",
      task: (star.task as string) ?? (o.task as string) ?? "",
      action: (star.action as string) ?? (o.action as string) ?? "",
      result: (star.result as string) ?? (o.result as string) ?? "",
    },
    earned_secret: (o.earned_secret as string) ?? (o.earnedSecret as string) ?? (o.insight as string),
    jd_keywords: (o.jd_keywords as string[]) ?? [],
  };
}

// bullet 归一 + 后端规则判定 + 稳定 id(老 bullet 无 id → text-hash 补发不丢弃,plan 修 H7)
function normalizeBullet(b: unknown, depth: Depth): CandidateBullet | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const text = ((o.text as string) ?? (o.bullet as string) ?? "").trim();
  if (!text) return null;
  const competency = (o.competency as string) ?? undefined;
  const source_story_id = (o.source_story_id as string) ?? (o.story_id as string) ?? undefined;
  const sc = (o.source_category as string) ?? (o.category as string) ?? undefined;
  const source_category = sc && OPTION_SETS[sc] ? sc : undefined;
  const id = (o.id as string) || makeBulletId({ competency, source_story_id, source_category, text });
  const sufficiency = gradeBullet(text);
  return {
    id,
    source_story_id,
    source_category,
    text,
    star_breakdown: (o.star_breakdown ?? o.starBreakdown ?? undefined) as CandidateBullet["star_breakdown"],
    competency,
    sufficiency,
    depth_met: depthMet(sufficiency, text, depth),
    anti_fab_note: (o.anti_fab_note as string) ?? (sufficiency === "thin" ? "草稿 — 待补" : undefined),
    hidden_value: Boolean(o.hidden_value),
  };
}

// ============ scrub 所有用户可见字段(plan 修 B/L4) ============
const COMPANY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/字节跳动|字节(?![一-龥])|抖音|TikTok|ByteDance/gi, "某互联网大厂"],
  [/阿里巴巴|阿里(?![一-龥])|淘宝|天猫|蚂蚁集团|蚂蚁金服|Alibaba/gi, "某互联网大厂"],
  [/腾讯|微信|QQ(?![一-龥])|Tencent/gi, "某互联网大厂"],
  [/美团|大众点评|Meituan/gi, "某互联网大厂"],
  [/百度|Baidu/gi, "某互联网大厂"],
  [/华为|Huawei/gi, "某科技公司"],
  [/京东|JD\.com/gi, "某互联网大厂"],
  [/拼多多|Pinduoduo|PDD/gi, "某互联网大厂"],
  [/网易(?![一-龥])|NetEase/gi, "某互联网大厂"],
  [/小米|Xiaomi/gi, "某科技公司"],
  [/滴滴|Didi/gi, "某互联网大厂"],
  [/快手|Kuaishou/gi, "某互联网大厂"],
  [/B 站|B站|哔哩哔哩|bilibili/gi, "某互联网大厂"],
  [/(?<![A-Za-z])Google(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Microsoft(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Meta(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Amazon(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Apple(?![A-Za-z])/g, "某科技公司"],
];
function scrub(text: string): string {
  let out = text;
  for (const [re, repl] of COMPANY_REPLACEMENTS) out = out.replace(re, repl);
  return out;
}

// ============ ask 解析:option_set key → 完整选项(后端拥有字典,plan 修 C) ============
type ResolvedAsk =
  | { type: "multi_select"; prompt: string; option_set: string; options: OptionItem[]; other_label: string }
  | { type: "open"; prompt: string }
  | null;
function resolveAsk(raw: unknown): ResolvedAsk {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o.type as string;
  const prompt = scrub(((o.prompt as string) ?? "").trim());
  if (type === "multi_select") {
    const key = (o.option_set as string) ?? "";
    const os = OPTION_SETS[key];
    if (!os) return prompt ? { type: "open", prompt } : null; // key 不认 → 退化 open
    return { type: "multi_select", prompt: prompt || os.prompt, option_set: key, options: os.options, other_label: os.other_label };
  }
  if (type === "open") return prompt ? { type: "open", prompt } : null;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
    const persona = typeof body.persona_tag === "string" && body.persona_tag ? body.persona_tag : undefined;
    const depth: Depth = ["shallow", "medium", "deep"].includes(body.depth) ? body.depth : "shallow";
    const intent = typeof body.intent === "string" ? body.intent : undefined;
    const current_intake: IntakeArtifact =
      body.current_intake && typeof body.current_intake === "object"
        ? body.current_intake
        : { roles: [], stories: [] };
    const current_bullets: CandidateBullet[] = Array.isArray(body.current_bullets) ? body.current_bullets : [];

    const systemPrompt = buildSystemPrompt({ persona, depth, intent });
    const userPrompt = buildUserPrompt({ history, current_intake, current_bullets });

    // 单次 LLM 调用 = 生成(判定归后端规则,Alt-1)
    async function callOnce(): Promise<string> {
      return chat(
        [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        { model: "chat", temperature: 0.4, max_tokens: 2200, jsonMode: true },
      );
    }
    let raw = await callOnce();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      raw = await callOnce(); // JSON 失败重试一次(plan 修 L)
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error("[m2/chat] JSON parse failed x2:", raw.slice(0, 300));
        return NextResponse.json({ error: "LLM 返回格式异常,请重试" }, { status: 502 });
      }
    }
    if (!parsed) {
      return NextResponse.json({ error: "LLM 返回格式异常,请重试" }, { status: 502 });
    }

    const say = scrub(((parsed.say as string) ?? (parsed.next_question as string) ?? "").trim());
    const ask = resolveAsk(parsed.ask);

    const delta_roles = (Array.isArray(parsed.delta_roles) ? parsed.delta_roles : [])
      .map(normalizeRole).filter((r): r is IntakeRole => r !== null);
    const delta_stories = (Array.isArray(parsed.delta_stories) ? parsed.delta_stories : [])
      .map(normalizeStory).filter((s): s is IntakeStory => s !== null)
      .map((s) => ({ ...s, star: {
        situation: scrub(s.star.situation), task: scrub(s.star.task),
        action: scrub(s.star.action), result: scrub(s.star.result),
      } }));
    const delta_bullets = (Array.isArray(parsed.delta_bullets) ? parsed.delta_bullets : [])
      .map((b) => normalizeBullet(b, depth)).filter((b): b is CandidateBullet => b !== null)
      .map((b) => ({ ...b, text: scrub(b.text) }));

    // 后端规则:收口建议 + 相位(plan Alt-1 / 🔴-2)
    const mergedBulletTexts = [
      ...current_bullets.map((b) => gradeBullet(b.text)),
      ...delta_bullets.map((b) => b.sufficiency),
    ];
    const readyCount = mergedBulletTexts.filter((s) => s !== "thin").length;
    const wrapThreshold = depth === "deep" ? 5 : depth === "medium" ? 4 : 3;
    const suggest_wrap =
      intent === "depth_change_down" ||
      Boolean(parsed.done) ||
      readyCount >= wrapThreshold;
    const phase = derivePhase(current_intake, [...current_bullets, ...delta_bullets], suggest_wrap);
    const done = Boolean(parsed.done ?? false);
    const reason = (parsed.reason as string) ?? undefined;

    return NextResponse.json({
      say, ask, phase, delta_roles, delta_stories, delta_bullets, suggest_wrap, done, reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m2/chat error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
