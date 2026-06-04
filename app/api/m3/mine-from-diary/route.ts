/**
 * POST /api/m3/mine-from-diary — 从 /diary entries 挖可写进简历的素材
 *
 * 客户端流程:
 *   1. /m3 页"从日记挖素材"按钮 → 弹明示同意 → 用户确认
 *   2. 客户端读 localStorage `buer_diary_entries` → POST 给本 endpoint
 *   3. endpoint 调 LLM → 返 candidates 列表
 *   4. 用户挑选 → 写进简历(沿用现有 m3 edit 流程)
 *
 * 隐私(plan §8.19 §B.5):
 *   - 日记原文只进 LLM context 一次(无服务器缓存,no DB 持久化)
 *   - 输出 candidate 不带原文,只带 source_excerpt(20-40 字)
 *
 * plan §8.19 §B.4 lock
 */

import { NextRequest, NextResponse } from "next/server";
import { chatVision, type VisionMessage, type VisionContentPart } from "@/lib/llm";

type DiaryEntryIn = {
  id: string;
  createdAt: string;
  content: string;
  title?: string;
  source?: string;
  /** v4 §8.22 — base64 data URL,LLM 多模态可读 */
  imageBase64?: string | null;
};

type CandidateBullet = {
  /** 命中的源 entry IDs(可能 1 个 entry 出 1 个 bullet,也可能多 entry 合 1 个) */
  source_entry_ids: string[];
  /** 20-40 字摘要,让用户知道挖自哪段 */
  source_excerpt: string;
  /** 给到简历的 bullet 文本(STAR / X-Y-Z 风格,简洁) */
  bullet: string;
  /** 命中的能力关键词(eg 组织协调 / 数据分析 / 跨团队沟通) */
  competency: string;
  /** high / mid / low — 看素材是否足够具体可写 */
  confidence: "high" | "mid" | "low";
};

function buildPrompt(
  entries: DiaryEntryIn[],
  targetRole: string | null,
  jdSummary: string | null
): { system: string; user: string } {
  const system = `你是「Offer 捕手」的简历素材挖掘顾问。从用户的日记里识别**可以写进简历**的经历素材。

【硬约束 — 严守】
1. **只从日记原文里识别**,绝不编造没出现的事(eg 用户没说"30+ 人"你不能瞎写数字)
2. 每个 candidate bullet **必须能追溯到 source_entry_ids** 里至少 1 条日记
3. **永远不输出公司名 / 具体人名 / 隐私信息**(只输出"行业 + 职位类型 + 能力")
4. 文案温和,不绝对化,不当 black box
5. **跳过无简历价值的日记**(纯情绪宣泄 / 私事 / 与求职无关的爱好)— 宁缺毋滥

【哪些日记有挖掘价值】
✓ 主持 / 组织 / 负责 / 带 N 人 的活动 → 组织协调
✓ 做了 / 完成 / 上线 / 发布 的项目 → 执行落地
✓ 学了 / 看完 / 实践了 的新技能 → 学习能力
✓ 推动 / 说服 / 协调 / 协商 的过程 → 沟通推动
✓ 解决 / 改进 / 优化 / 排查 的问题 → 问题解决
✓ 数据 / 量化 / 增长 / 转化 的成果 → 数据驱动

【哪些日记 SKIP】
✗ 纯情绪日记("今天好难过","压力大")
✗ 隐私日记("跟妈妈吵架","暗恋 someone")
✗ 流水账没动作动词("今天吃了火锅")
✗ 求职无关爱好闲聊("追番了 3 集")

【AI 整理版日记的特殊处理】
- 看到日记标注 [AI 整理版] = 这是 LLM 把用户聊天重写成第一人称日记的
- 仍然可以挖素材,**但 source_excerpt 前必须加 "(AI 整理自对话)" 前缀**,让用户知道源头是聊天不是手写日记
- 例:source_excerpt 写 "(AI 整理自对话)主持文艺晚会 300+ 同学到场"

【📷 日记附图(v4 多模态)】
- 部分日记会附图(eg "今天做了个海报",附海报照片)
- 你能看到图,**只看从图里可以推断的可写进简历的能力信号**(eg 海报设计 → 设计能力)
- **绝不**根据图里的私人信息猜测(eg 自拍 / 私人物品 / 家人朋友)
- 如果图本身没简历价值(纯生活照),source_excerpt 仅说文字部分,图当背景

【输出 JSON 严格格式,无 markdown 包裹】
{
  "candidates": [
    {
      "source_entry_ids": ["uuid-1"],
      "source_excerpt": "20-40 字摘要,让用户知道挖自哪条日记",
      "bullet": "STAR/XYZ 风格的简历 bullet(基于日记真实信息,不编数字)",
      "competency": "组织协调 / 数据分析 / etc",
      "confidence": "high"
    }
  ]
}

candidates 数量:**0-5 个**(没合适素材就给 0 个空数组,不强凑)`;

  const targetCtx = targetRole
    ? `\n目标岗位方向:${targetRole}`
    : "\n目标岗位:用户没指定,挖通用素材";
  const jdCtx = jdSummary ? `\n目标 JD 摘要:${jdSummary}` : "";

  // v2 §8.20 §C.4 anti-fab 第 4 层 — ai-summary entry 透传来源给 LLM,挖出来的 candidate 标注
  // v4 §8.22 — 图片单独提取(LLM vision messages 加 image_url part)
  const entriesBlock = entries
    .map((e, idx) => {
      const dateOnly = e.createdAt.slice(0, 10);
      const sourceMark =
        e.source === "ai-summary"
          ? " [AI 整理版]"
          : e.source === "buer-chat"
          ? " [来自不二聊天]"
          : "";
      const imgMark = e.imageBase64 ? " [附图]" : "";
      return `${idx + 1}. [id=${e.id}] ${dateOnly}${
        e.title ? ` · ${e.title}` : ""
      }${sourceMark}${imgMark}\n   ${e.content}`;
    })
    .join("\n\n");

  const user = `用户上传了 ${entries.length} 条日记,请挑出可写进简历的素材。${targetCtx}${jdCtx}

【日记 entries】
${entriesBlock}

请返 JSON。`;

  return { system, user };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entries = body.entries as DiaryEntryIn[] | undefined;
    const targetRole = (body.targetRole as string | undefined) ?? null;
    const jdSummary = (body.jdSummary as string | undefined) ?? null;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "entries required (non-empty array)" },
        { status: 400 }
      );
    }

    // 限制单次最多 50 条(防 token 爆 + 也给 LLM 留思考空间)
    const limited = entries.slice(0, 50);

    const { system, user } = buildPrompt(limited, targetRole, jdSummary);

    // v4 §8.22 — 收集 entry 里所有图,组装 vision message
    // 每张图带 "[id=xxx] 的附图" 文字注释,让 LLM 知道对应哪条 entry
    const imageParts: VisionContentPart[] = [];
    for (const e of limited) {
      if (e.imageBase64) {
        imageParts.push({
          type: "text",
          text: `↓ entry [id=${e.id}] 的附图 ↓`,
        });
        imageParts.push({
          type: "image_url",
          image_url: { url: e.imageBase64 },
        });
      }
    }

    const userContent: VisionContentPart[] =
      imageParts.length > 0
        ? [{ type: "text", text: user }, ...imageParts]
        : [{ type: "text", text: user }];

    const visionMessages: VisionMessage[] = [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ];

    const raw = await chatVision(visionMessages, {
      temperature: 0.4,
      max_tokens: 2500,
      jsonMode: true,
    });

    let parsed: { candidates: CandidateBullet[] };
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[mine-from-diary] JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw },
        { status: 502 }
      );
    }

    // 兜底:candidates 必须是数组
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];

    return NextResponse.json({
      candidates,
      total_entries_analyzed: limited.length,
      total_entries_skipped: entries.length - limited.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/mine-from-diary error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
