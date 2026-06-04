"use client";

import Link from "next/link";
import {
  CONFIDENCE_LABELS,
  DIMENSION_LABELS,
  getDimensionLevel,
  getSelectedInterests,
  INTEREST_TAGS,
  type Confidence,
  type Dimension,
} from "@/lib/quiz-data";

const DIMS: Dimension[] = ["R", "I", "A", "S", "E", "C"];

type Rationale = {
  interestEvidence?: string | null;
  experienceEvidence?: string | null;
  preferenceSignals?: string | null;
  confidence?: Confidence | null;
  confidenceWhy?: string | null;
  cautions?: string[] | null;
  nextStep?: string | null;
  whyNotOther?: string | null;
};

export type EvidenceInfo = {
  source: "resume" | "chat" | "skip";
  summary?: string;
  tags?: string[];
  userNotes?: string;
  quality?: "high" | "mid" | "low";
} | null;

type Props = {
  scores: [number, number, number, number, number, number];
  confidence: Confidence;
  answers?: Record<number, number | string[] | Record<string, number>>;
  rationale?: Rationale | null;
  evidence?: EvidenceInfo;
  isSample?: boolean;
  className?: string;
};

function getTop3Code(scores: [number, number, number, number, number, number]): Array<{
  dim: Dimension;
  score: number;
  level: "high" | "mid" | "low";
}> {
  return DIMS.map((d, i) => ({ dim: d, score: scores[i], order: i }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    })
    .slice(0, 3)
    .map((p) => ({
      dim: p.dim,
      score: p.score,
      level: getDimensionLevel(p.score),
    }));
}

function getStrongInterests(
  answers?: Props["answers"]
): Array<{ label: string; key: string; text: string; strength: number }> {
  if (!answers) return [];
  const picked = getSelectedInterests(answers);
  return picked
    .filter((p) => p.strength >= 4)
    .map((p) => {
      const tag = INTEREST_TAGS.find((t) => t.key === p.key);
      return tag
        ? { label: tag.label, key: tag.key, text: tag.text, strength: p.strength }
        : null;
    })
    .filter((x): x is { label: string; key: string; text: string; strength: number } => x !== null)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);
}

function getSkipGuide() {
  return (
    <span>
      你跳过了「补充信息」 — 想让推荐更准,可以
      <Link
        href="/m1/evidence"
        className="text-esther-blue underline hover:text-esther-blue-dark mx-1"
      >
        补一份简历或简单聊两句 →
      </Link>
    </span>
  );
}

function dimensionNarrative(
  top3: ReturnType<typeof getTop3Code>
): string {
  if (top3.length === 0) return "测评信号太弱,先把题答完";
  const phrases = top3.map((t) => {
    const lvlCn =
      t.level === "high" ? "高" : t.level === "mid" ? "中" : "低";
    return `${DIMENSION_LABELS[t.dim].cn}(${t.dim}${t.score}・${lvlCn})`;
  });
  return `Top 3 维度:${phrases.join(" · ")}`;
}

function confidenceDefaultWhy(
  confidence: Confidence,
  scores: [number, number, number, number, number, number]
): string {
  const top1 = Math.max(...scores);
  if (confidence === "high") {
    return `Top1 = ${top1}/15,落在「高」区间,分布有明显倾向,推荐稳定。`;
  }
  if (confidence === "mid") {
    return `Top1 = ${top1}/15,分布有方向但还不够分化,可以多答几题或修推荐。`;
  }
  if (confidence === "low") {
    return `答得不多 + Top1 = ${top1}/15,信号偏弱,推荐只能给方向感参考。`;
  }
  return "答得太少,目前还不足以给出推荐。";
}

export function RecommendationRationale({
  scores,
  confidence,
  answers,
  rationale,
  evidence,
  isSample,
  className,
}: Props) {
  const top3 = getTop3Code(scores);
  const strongInterests = getStrongInterests(answers);
  const r = rationale || {};

  const evidenceSource = evidence?.source ?? "skip";
  const evidenceTags = (evidence?.tags ?? []).slice(0, 6);
  const evidenceUserNotes = evidence?.userNotes?.trim() || null;

  const interestEvidence = r.interestEvidence?.trim() || null;
  const experienceEvidence = r.experienceEvidence?.trim() || null;
  const preferenceSignals = r.preferenceSignals?.trim() || null;
  const cautions = Array.isArray(r.cautions)
    ? r.cautions.filter((c) => typeof c === "string" && c.trim().length > 0)
    : [];
  const nextStep = r.nextStep?.trim() || null;
  const whyNotOther = r.whyNotOther?.trim() || null;
  const confidenceWhy =
    r.confidenceWhy?.trim() || confidenceDefaultWhy(confidence, scores);

  return (
    <section
      className={`border-b border-border bg-card ${className ?? ""}`}
      aria-label="推荐依据"
    >
      <div className="max-w-[1100px] mx-auto px-6 py-12">
        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
          <p className="font-display italic text-sm text-esther-blue">
            How we get here
          </p>
          {isSample && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-warm-bg-deep text-ink-muted border border-border">
              sample
            </span>
          )}
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
          推荐依据 · 我们是怎么挑出这些方向的
        </h2>
        <p className="text-sm text-ink-soft mb-8 max-w-2xl">
          不只是给方向 — 把 6 维测评分数、兴趣偏好、置信度和取舍逻辑全摊给你看,
          你可以判断对不对。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 块 1:兴趣维度 */}
          <article className="p-5 rounded-2xl border-2 border-border bg-warm-bg-deep/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🧭</span>
              <h3 className="text-base font-semibold text-ink">兴趣维度</h3>
            </div>
            <p className="text-sm text-ink leading-relaxed mb-2">
              {dimensionNarrative(top3)}
            </p>
            {interestEvidence && (
              <p className="text-sm text-ink-soft leading-relaxed">
                {interestEvidence}
              </p>
            )}
          </article>

          {/* 块 2:经历证据 — 三状态(resume / chat / skip) */}
          <article className="p-5 rounded-2xl border-2 border-border bg-warm-bg-deep/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">
                {evidenceSource === "resume"
                  ? "📄"
                  : evidenceSource === "chat"
                  ? "💬"
                  : "💼"}
              </span>
              <h3 className="text-base font-semibold text-ink">经历证据</h3>
              {evidenceSource !== "skip" && (
                <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-esther-blue/10 text-esther-blue border border-esther-blue/30">
                  {evidenceSource === "resume" ? "基于简历" : "基于补充对话"}
                </span>
              )}
            </div>
            {evidenceSource === "skip" ? (
              <p className="text-sm text-ink-soft leading-relaxed">
                {experienceEvidence ?? getSkipGuide()}
              </p>
            ) : (
              <>
                <p className="text-sm text-ink leading-relaxed mb-2">
                  {experienceEvidence ||
                    "我们结合了你提供的补充信息做推荐(LLM 摘要中)。"}
                </p>
                {evidenceTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {evidenceTags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-esther-blue/10 text-esther-blue text-[11px] font-medium"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                {evidenceSource === "chat" && evidenceUserNotes && (
                  <p className="text-xs text-ink-muted italic leading-relaxed mt-2 pt-2 border-t border-border">
                    「{evidenceUserNotes}」(你的原话)
                  </p>
                )}
                <p className="text-xs text-ink-muted mt-3">
                  <Link
                    href="/m1/evidence"
                    className="text-esther-blue hover:text-esther-blue-dark underline"
                  >
                    🔄 重新补充 / 换个方式 →
                  </Link>
                </p>
              </>
            )}
          </article>

          {/* 块 3:偏好信号 */}
          <article className="p-5 rounded-2xl border-2 border-border bg-warm-bg-deep/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⭐</span>
              <h3 className="text-base font-semibold text-ink">偏好信号</h3>
            </div>
            {strongInterests.length > 0 ? (
              <>
                <p className="text-xs text-ink-muted mb-2">
                  你强烈喜欢的兴趣(强度 ≥ 4):
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {strongInterests.map((s) => (
                    <span
                      key={s.key}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-esther-yellow/30 text-ink text-xs font-medium border border-esther-yellow/60"
                    >
                      <span className="text-sm">{s.label}</span>
                      <span>{s.text.split("(")[0].trim()}</span>
                      <span className="font-display italic text-esther-blue">
                        {s.strength}/5
                      </span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-muted leading-relaxed">
                你没有特别强烈(强度 ≥ 4)的兴趣 tag,推荐主要看测评维度。
              </p>
            )}
            {preferenceSignals && (
              <p className="text-sm text-ink-soft leading-relaxed mt-2">
                {preferenceSignals}
              </p>
            )}
          </article>

          {/* 块 4:推荐置信度 */}
          <article className="p-5 rounded-2xl border-2 border-border bg-warm-bg-deep/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📊</span>
              <h3 className="text-base font-semibold text-ink">推荐置信度</h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                  confidence === "high"
                    ? "bg-esther-blue text-white"
                    : confidence === "mid"
                    ? "bg-esther-yellow text-ink"
                    : "bg-warm-bg-deep text-ink-muted"
                }`}
              >
                {CONFIDENCE_LABELS[confidence]}
              </span>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed">
              {confidenceWhy}
            </p>
          </article>

          {/* 块 5:为什么不是其他方向(跨整行) */}
          <article className="md:col-span-2 p-5 rounded-2xl border-2 border-border bg-warm-bg-deep/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔍</span>
              <h3 className="text-base font-semibold text-ink">
                为什么不是其他方向
              </h3>
            </div>
            {whyNotOther ? (
              <p className="text-sm text-ink leading-relaxed">{whyNotOther}</p>
            ) : (
              <p className="text-sm text-ink-muted leading-relaxed">
                往下翻可以看「反向 3 个」的取舍逻辑 — 我们不评判这些方向,只描述跟你的契合点错位在哪。
              </p>
            )}
          </article>

          {/* 取舍提醒 + next step */}
          {(cautions.length > 0 || nextStep) && (
            <article className="md:col-span-2 p-5 rounded-2xl border-2 border-esther-yellow/60 bg-esther-yellow/10">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">📌</span>
                <h3 className="text-base font-semibold text-ink">温和提醒</h3>
              </div>
              {cautions.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {cautions.map((c, i) => (
                    <li
                      key={i}
                      className="text-sm text-ink leading-relaxed flex items-start gap-2"
                    >
                      <span className="text-esther-blue mt-1.5 text-[8px]">●</span>
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {nextStep && (
                <p className="text-sm text-ink leading-relaxed pt-2 border-t border-esther-yellow/40">
                  <span className="font-semibold">下一步建议:</span> {nextStep}
                </p>
              )}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
