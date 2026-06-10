"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Job } from "./types";

interface JobCardProps {
  job: Job;
  onOptimizeResume?: (job: Job) => void;
  onPracticeInterview?: (job: Job) => void;
  onViewDetail?: (job: Job) => void;
  showMatch?: boolean;
  /** 正在为这张卡抓取完整 JD(handoff 前)→ 两个跳转按钮显示"抓取中"并禁用 */
  busy?: boolean;
}

const PLATFORM_LABEL: Record<string, { label: string; color: string; site: string }> = {
  "51job": {
    label: "前程无忧",
    color: "bg-esther-yellow/30 text-ink border-esther-yellow/60",
    site: "51job.com",
  },
  liepin: {
    label: "猎聘",
    color: "bg-esther-red/10 text-esther-red border-esther-red/30",
    site: "liepin.com",
  },
  zhilian: {
    label: "智联招聘",
    color: "bg-esther-blue/10 text-esther-blue border-esther-blue/30",
    site: "zhaopin.com",
  },
};

function ScoreCircle({ score }: { score: number }) {
  const color =
    score >= 85
      ? "text-esther-blue border-esther-blue bg-esther-blue/10"
      : score >= 70
        ? "text-ink border-esther-yellow bg-esther-yellow/30"
        : "text-ink-soft border-ink-soft/30 bg-warm-bg-deep";

  return (
    <div className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center ${color}`}>
      <span className="text-lg font-bold leading-none">{score}</span>
      <span className="text-[10px] leading-none mt-0.5 opacity-70">分</span>
    </div>
  );
}

export function JobCard({
  job,
  onOptimizeResume,
  onPracticeInterview,
  onViewDetail,
  showMatch = false,
  busy = false,
}: JobCardProps) {
  const platform = PLATFORM_LABEL[job.platform] ?? PLATFORM_LABEL["51job"]!;

  return (
    <article className="bg-card border-2 border-border rounded-2xl p-5 hover:border-esther-blue/50 hover:shadow-md transition-all">
      {/* 顶部:标题 + 评分 */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* 标题可点击 → 在新窗口打开原网页 */}
            <a
              href={job.jdUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-semibold text-ink hover:text-esther-blue hover:underline truncate"
              title={`在 ${platform.site} 打开:${job.title}`}
            >
              {job.title}
            </a>
            {/* 平台 badge 也可点击,带 ↗ 提示是外链 */}
            <a
              href={job.jdUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`数据来源:${platform.site}`}
              className="flex-shrink-0"
            >
              <Badge
                className={`${platform.color} border text-[10px] hover:opacity-80 transition-opacity`}
              >
                {platform.label} ↗
              </Badge>
            </a>
          </div>
          <p className="text-sm text-ink-soft truncate">{job.company}</p>
        </div>
        {showMatch && job.matchScore !== undefined && <ScoreCircle score={job.matchScore} />}
      </div>

      {/* 元信息行 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft mb-3">
        <span className="text-esther-red font-medium">{job.salary || "薪资面议"}</span>
        <span>·</span>
        <span>
          {job.city}
          {job.district ? ` ${job.district}` : ""}
        </span>
        {job.experience && (
          <>
            <span>·</span>
            <span>{job.experience}</span>
          </>
        )}
        {job.education && (
          <>
            <span>·</span>
            <span>{job.education}</span>
          </>
        )}
      </div>

      {/* 技能标签 */}
      {job.tags && job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {job.tags.slice(0, 8).map((tag, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded-md bg-warm-bg-deep text-ink-soft border border-border/60"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 匹配详情(仅推荐 tab 展示) */}
      {showMatch && (job.matchHighlights?.length || job.matchGaps?.length) ? (
        <div className="space-y-2 mb-4 bg-warm-bg-deep/40 rounded-lg p-3 border border-border/60">
          {job.matchHighlights && job.matchHighlights.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-esther-blue mb-1">✓ 命中</p>
              <ul className="space-y-0.5">
                {job.matchHighlights.slice(0, 3).map((h, i) => (
                  <li key={i} className="text-xs text-ink leading-relaxed">
                    · {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {job.matchGaps && job.matchGaps.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-esther-red mb-1">△ Gap</p>
              <ul className="space-y-0.5">
                {job.matchGaps.slice(0, 3).map((g, i) => (
                  <li key={i} className="text-xs text-ink-soft leading-relaxed">
                    · {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
        {onViewDetail && (
          <button
            onClick={() => onViewDetail(job)}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-warm-bg hover:border-esther-blue hover:text-esther-blue transition-colors"
          >
            看 JD
          </button>
        )}
        {/* 明显的"去原页面"——新标签页直开平台真实招聘页 */}
        <Link
          href={job.jdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 rounded-md border border-esther-blue/40 text-esther-blue bg-esther-blue/5 hover:bg-esther-blue/10 transition-colors font-medium"
          title={`在 ${platform.site} 打开原始招聘页`}
        >
          去原页面 ↗
        </Link>
        {onOptimizeResume && (
          <button
            onClick={() => onOptimizeResume(job)}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-esther-blue text-white hover:bg-esther-blue-dark transition-colors font-medium disabled:opacity-60"
          >
            {busy ? "抓取完整 JD…" : "用这个优化简历 →"}
          </button>
        )}
        {onPracticeInterview && (
          <button
            onClick={() => onPracticeInterview(job)}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-esther-yellow text-ink hover:bg-esther-yellow/80 transition-colors font-medium disabled:opacity-60"
          >
            {busy ? "抓取完整 JD…" : "用这个练面试 →"}
          </button>
        )}
        <span className="ml-auto text-[11px] text-ink-muted self-center">
          {platform.site}
        </span>
      </div>
    </article>
  );
}
