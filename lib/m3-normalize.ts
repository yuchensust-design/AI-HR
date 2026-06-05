/**
 * M3 反编造 normalize 层(offer-1-sparkling-hippo)
 *
 * 设计原则:
 *   LLM 自律(prompt 约束)不可靠 — 必须有 post-processing 校验层。
 *   normalize 接收 LLM 返回的 EditSuggestion[],对每条 suggested_text 做"数字 / 量词"溯源检查:
 *     - 任何数字 token(如 "15+ 用户" / "30%" / "5 款竞品" / "200+ 新生")
 *       必须能在 sourceCorpus 中精确找到,否则:
 *       (a) 数字 token 替换为 【请补充】 占位符
 *       (b) claim_type 降级到 "needs_confirmation"
 *       (c) priority 不变(让 UI 仍展示),但默认 accept 不放行
 *   同时检测一类"强承诺词"(被采纳 / 提升 X% / 零差错 / 显著改善),如果对应描述
 *   在源材料里没有依据,也降级为 needs_confirmation。
 *
 * 复用规则:同样适用于 rewrite-bullet 返回的单条 suggested_text。
 */

import type { ClaimType, EditSuggestion } from "@/components/EditSuggestionCard";

/** 占位符 — UI 展示时和 export 时都保留,告诉用户"这里你需要补" */
export const PLACEHOLDER = "【请补充】";

/**
 * 从文本里提取"声称的数字 / 量词" — 关注容易被编造的事实型数字。
 * 例:"15+ 用户访谈" → ["15+ 用户", "15"]; "30% 提升" → ["30%"]; "5 款竞品" → ["5 款", "5"]; "150+ 潜在用户" → ["150+ 潜在用户", "150"];
 *
 * 不提取:年份 / 日期 / "1 期" 这种背景信息(因为它们在简历里通常本来就有,不算编造高风险)。
 *
 * 思路:
 *   匹配 (中文/英文/混合) 数字 token = [\d]+[+]?[%]?  后接量词
 *   量词:%、款、份、人、次、篇、个、家、条、轮、版、组、级、年、月、周、日、天、轮、轮次、版本、用户、客户、新生、同学、潜在用户
 */
const NUMERIC_CLAIM_REGEX =
  /(\d+\.?\d*)([%]|\+|\s*(?:款|份|人|次|篇|个|家|条|轮|版|组|位|名|人次|用户|客户|新生|学生|同学|潜在用户|顾客|访谈对象|受访者)|\s*%)?/g;

/** 强承诺词 — 出现就要审查 */
const STRONG_CLAIM_PATTERNS = [
  /被采纳/g,
  /被(?:团队|领导|老师|公司)?接受/g,
  /提升[\d.]+%/g,
  /增长[\d.]+%/g,
  /提高[\d.]+%/g,
  /零差错/g,
  /显著改善/g,
  /大幅提升/g,
  /反响(?:热烈|极佳)/g,
  /备受好评/g,
];

/**
 * 检查数字 token 是否在 corpus 中出现。
 * 简化策略:
 *   1) 完整 token 在 corpus(toLowerCase)中精确匹配 → 合法
 *   2) 仅纯数字部分在 corpus 中出现 → 合法(可能源里用了不同量词)
 *   3) 不在 corpus → 非法
 */
function tokenInCorpus(rawToken: string, corpus: string): boolean {
  const trimmed = rawToken.trim();
  if (!trimmed) return true;
  // 排除明显的年份(20XX / 19XX),它们是低风险背景信息
  if (/^(19|20)\d{2}$/.test(trimmed)) return true;
  // 排除单纯的 "1" "2" "3" 这种过于通用的数字
  if (/^[1-9]$/.test(trimmed)) return true;
  const lowered = corpus.toLowerCase();
  if (lowered.includes(trimmed.toLowerCase())) return true;
  // 提取纯数字 fallback
  const num = trimmed.match(/\d+\.?\d*/)?.[0];
  if (num && lowered.includes(num)) return true;
  return false;
}

export type NormalizeReport = {
  /** suggested_text 是否被修改(数字替换为占位符) */
  modified: boolean;
  /** 替换掉的数字 token */
  replacedTokens: string[];
  /** 触发的强承诺词 */
  strongClaimsHit: string[];
  /** normalize 后的 claim_type */
  resolvedClaimType: ClaimType;
};

/**
 * 单条 suggested_text 的 normalize。
 * 返回 [新文本, report]。
 */
export function normalizeSuggestedText(
  suggestedText: string,
  sourceCorpus: string,
  originalClaimType?: ClaimType,
): [string, NormalizeReport] {
  const corpus = sourceCorpus ?? "";
  let modified = false;
  const replacedTokens: string[] = [];
  const strongClaimsHit: string[] = [];

  // 1) 替换不在 corpus 的数字 token
  let normalized = suggestedText.replace(NUMERIC_CLAIM_REGEX, (match) => {
    if (tokenInCorpus(match, corpus)) return match;
    modified = true;
    replacedTokens.push(match.trim());
    return PLACEHOLDER;
  });

  // 2) 检测强承诺词
  for (const pat of STRONG_CLAIM_PATTERNS) {
    const matches = normalized.match(pat);
    if (matches) {
      matches.forEach((m) => {
        if (!corpus.toLowerCase().includes(m.toLowerCase())) {
          strongClaimsHit.push(m);
        }
      });
    }
  }

  // 3) 决定最终 claim_type
  let resolvedClaimType: ClaimType =
    originalClaimType ?? "needs_confirmation";

  if (replacedTokens.length > 0 || strongClaimsHit.length > 0) {
    // 出现编造迹象 → 强制降级
    resolvedClaimType = "needs_confirmation";
  } else if (originalClaimType === "explicit") {
    resolvedClaimType = "explicit";
  } else if (originalClaimType === "inferred") {
    resolvedClaimType = "inferred";
  } else if (!originalClaimType) {
    // LLM 没声明 → 默认 needs_confirmation,UI 不自动 accept
    resolvedClaimType = "needs_confirmation";
  }

  return [
    normalized,
    {
      modified,
      replacedTokens,
      strongClaimsHit,
      resolvedClaimType,
    },
  ];
}

/**
 * 批量 normalize EditSuggestion[]。
 * 副作用:为每条 edit 写入/覆盖 claim_type 字段;若 suggested_text 被改,
 * 在 reason 末尾加一行"⚠ 已替换 N 处未确认数字为占位符,请补充"。
 */
export function normalizeEditSuggestions(
  edits: EditSuggestion[],
  sourceCorpus: string,
): EditSuggestion[] {
  return edits.map((edit) => {
    const [newText, report] = normalizeSuggestedText(
      edit.suggested_text,
      sourceCorpus,
      edit.claim_type,
    );
    if (!report.modified && report.strongClaimsHit.length === 0) {
      // 无变化,只补 claim_type 字段(向后兼容)
      return { ...edit, claim_type: report.resolvedClaimType };
    }
    const warnings: string[] = [];
    if (report.replacedTokens.length > 0) {
      warnings.push(
        `已替换 ${report.replacedTokens.length} 处未在原始素材中的数字为占位符(${report.replacedTokens.slice(0, 3).join(" / ")})`,
      );
    }
    if (report.strongClaimsHit.length > 0) {
      warnings.push(
        `强承诺词需确认(${report.strongClaimsHit.slice(0, 2).join(" / ")})`,
      );
    }
    const newWarning = warnings.join(";");
    const mergedFabWarning = edit.fab_warning
      ? `${edit.fab_warning}\n⚠ ${newWarning}`
      : `⚠ ${newWarning}`;
    return {
      ...edit,
      suggested_text: newText,
      claim_type: report.resolvedClaimType,
      fab_warning: mergedFabWarning,
    };
  });
}

/**
 * 拼接 source corpus:parsedResume + jdContext + hiddenExperiences + fromDebriefHighlight。
 * 用于喂给 normalize 做"数字溯源"检查。
 */
export function buildSourceCorpus(input: {
  parsedResume?: unknown;
  jdContext?: unknown;
  hiddenExperiences?: unknown;
  fromDebriefHighlight?: unknown;
}): string {
  const parts: string[] = [];
  try {
    if (input.parsedResume) parts.push(JSON.stringify(input.parsedResume));
    if (input.jdContext) parts.push(JSON.stringify(input.jdContext));
    if (input.hiddenExperiences)
      parts.push(JSON.stringify(input.hiddenExperiences));
    if (input.fromDebriefHighlight)
      parts.push(JSON.stringify(input.fromDebriefHighlight));
  } catch {
    // ignore stringify errors
  }
  return parts.join("\n\n");
}
