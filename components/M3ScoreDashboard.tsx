"use client";

/**
 * M3 综合匹配评分大卡(2026-06-07 V3)— 完全照抄用户给的竞品截图样式
 *
 * 左:大数字 92/100 + ↑ +N 分 chip + 3 个绿色 ✓ chip(关键词补强 / 成果表达增强 / 结构更完整)
 * 右:维度 4 维 progress bars(岗位匹配度 / 关键词覆盖度 / 结构完整度 / 成果表达清晰度)
 *
 * 数据全部基于 props 传入,无 fetch — 由 result page 算好传过来
 */

export type M3DashboardData = {
  totalScore: number; // 综合匹配评分 0-100
  delta: number; // 较 v1 提升分
  acceptedCount: number; // AI 已改 N 处
  pendingCount: number; // 待你填 N 处
  // 4 维度评分(0-100)
  jdMatchPct: number; // 岗位匹配度
  keywordsCoveragePct: number; // 关键词覆盖度
  structurePct: number; // 结构完整度
  achievementPct: number; // 成果表达清晰度
  // 3 个 ✓ 维度小 chip(用来突出"AI 做了什么")
  improveTags: string[];
  loading?: boolean;
};

export function M3ScoreDashboard({ data }: { data: M3DashboardData }) {
  const {
    totalScore,
    delta,
    jdMatchPct,
    keywordsCoveragePct,
    structurePct,
    achievementPct,
    improveTags,
    loading,
  } = data;

  return (
    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 左:综合匹配评分 */}
      <div>
        <p className="text-sm text-emerald-700/80 mb-2">综合匹配评分</p>
        <div className="flex items-end gap-3 mb-4">
          <span className="text-6xl md:text-7xl font-bold text-emerald-700 leading-none">
            {loading ? "—" : totalScore}
          </span>
          <span className="text-lg text-emerald-600/80 mb-1.5">/100</span>
          {!loading && delta > 0 && (
            <span className="ml-2 mb-2 inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-700 text-sm font-medium">
              ↑ +{delta} 分
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {improveTags.length > 0 ? (
            improveTags.map((tag, i) => (
              <span
                key={i}
                className="inline-flex items-center px-3 py-1.5 rounded-md bg-white/70 border border-emerald-200 text-emerald-700 text-xs font-medium"
              >
                {tag} ✓
              </span>
            ))
          ) : (
            <span className="text-xs text-emerald-700/60">
              {loading ? "AI 评估中…" : "已优化"}
            </span>
          )}
        </div>
      </div>

      {/* 右:4 维度评分 */}
      <div>
        <p className="text-sm text-emerald-700/80 mb-3 text-right md:text-right">维度评分</p>
        <div className="space-y-2.5">
          <DimensionRow label="岗位匹配度" pct={jdMatchPct} loading={loading} />
          <DimensionRow
            label="关键词覆盖度"
            pct={keywordsCoveragePct}
            loading={loading}
          />
          <DimensionRow label="结构完整度" pct={structurePct} loading={loading} />
          <DimensionRow
            label="成果表达清晰度"
            pct={achievementPct}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

function DimensionRow({
  label,
  pct,
  loading,
}: {
  label: string;
  pct: number;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-emerald-700/80 flex-shrink-0 w-24 text-right">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-white/70 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-500 ease-out rounded-full"
          style={{ width: loading ? "0%" : `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <span className="text-sm text-emerald-700 font-semibold flex-shrink-0 w-12 text-right">
        {loading ? "—" : `${Math.round(pct)}%`}
      </span>
    </div>
  );
}
