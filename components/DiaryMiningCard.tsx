"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getDiaryEntries, type DiaryEntry } from "@/lib/diary";

/**
 * 📔 m3 "从日记挖素材" 卡片
 *
 * 折叠式 — 默认折叠避免打扰主流程;展开 → 明示同意 → 调 /api/m3/mine-from-diary → 渲染 candidates
 *
 * 隐私(plan §8.19 §B.5 lock):
 *   - 默认折叠,用户主动展开才显示
 *   - 展开后明示告知:"会把日记原文发给 LLM 做一次分析,后端不存"
 *   - 用户确认才发请求
 *   - 输出 candidates 用户可复制 / 不强制写进简历
 *
 * plan §8.19 §B.4 lock
 */

type Candidate = {
  source_entry_ids: string[];
  source_excerpt: string;
  bullet: string;
  competency: string;
  confidence: "high" | "mid" | "low";
};

type Phase = "idle" | "consent" | "loading" | "result" | "error";

export function DiaryMiningCard({
  targetRole,
  jdSummary,
}: {
  targetRole?: string | null;
  jdSummary?: string | null;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    setHydrated(true);
    setEntries(getDiaryEntries());
  }, []);

  const runMining = async () => {
    setPhase("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/m3/mine-from-diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: entries.map((e) => ({
            id: e.id,
            createdAt: e.createdAt,
            content: e.content,
            title: e.title,
            source: e.source,
          })),
          targetRole,
          jdSummary,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `请求失败 ${res.status}`);
      }
      const data = await res.json();
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      setPhase("result");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "未知错误");
      setPhase("error");
    }
  };

  const handleCopy = async (idx: number, bullet: string) => {
    try {
      await navigator.clipboard.writeText(bullet);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // ignore
    }
  };

  // 折叠态 header
  const collapsedHeader = (
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full p-5 text-left flex items-center justify-between gap-4 hover:bg-warm-bg-deep/30 transition-colors rounded-2xl"
    >
      <div className="flex-1">
        <p className="font-display italic text-xs text-esther-blue mb-1">
          Bonus · plan §8.19
        </p>
        <h3 className="text-base font-semibold text-ink mb-1 leading-snug">
          📔 从日记里挖简历素材
        </h3>
        <p className="text-xs text-ink-soft leading-relaxed">
          {hydrated && entries.length === 0
            ? "你还没写过日记 · 平时跟「不二」聊天或在 /diary 写一条,这里就能挖了"
            : `已有 ${entries.length} 条日记 · 让 AI 看看里面有没有可以写进简历的素材`}
        </p>
      </div>
      <span className="text-esther-blue text-lg flex-shrink-0">
        {open ? "▾" : "▸"}
      </span>
    </button>
  );

  // 无日记态
  if (hydrated && entries.length === 0 && !open) {
    return (
      <Card className="border-2 border-dashed border-border bg-card overflow-hidden">
        {collapsedHeader}
      </Card>
    );
  }

  return (
    <Card className="border-2 border-esther-yellow/40 bg-esther-yellow/5 overflow-hidden">
      {collapsedHeader}

      {open && (
        <div className="border-t border-esther-yellow/30 px-5 py-5 space-y-4">
          {/* 无日记 — 展开后显示引导 */}
          {hydrated && entries.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-ink-soft mb-3 leading-relaxed">
                还没写过日记 · 两种方式都行:
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href="/diary"
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-xs font-medium hover:bg-esther-blue-dark transition-colors"
                >
                  去 /diary 写一条 →
                </Link>
                <span className="text-xs text-ink-muted">或</span>
                <span className="text-xs text-ink-soft">
                  右下角点「不二」聊天 → user 消息可点 📔 记成日记
                </span>
              </div>
            </div>
          )}

          {/* idle:同意 + 跑 */}
          {hydrated && entries.length > 0 && phase === "idle" && (
            <>
              <div className="p-4 rounded-xl bg-warm-bg-deep/50 border border-border space-y-2">
                <p className="text-xs font-semibold text-ink">
                  🔒 在挖之前,先说明一下:
                </p>
                <ul className="text-xs text-ink-soft space-y-1.5 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-esther-blue mt-0.5">●</span>
                    会把你 <strong>{entries.length}</strong> 条日记的内容发给 LLM 做 1 次分析
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-esther-blue mt-0.5">●</span>
                    我们 <strong>后端不存</strong> · DeepSeek API 也不会留存
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-esther-blue mt-0.5">●</span>
                    输出候选 bullet 你可复制 · 不会自动写进简历
                  </li>
                </ul>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={runMining}
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
                >
                  ✓ 我同意 → 开始挖
                </button>
                <Link
                  href="/diary"
                  className="text-xs text-ink-muted hover:text-esther-blue transition-colors"
                >
                  先去 /diary 看一下都有什么 →
                </Link>
              </div>
            </>
          )}

          {/* loading */}
          {phase === "loading" && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin w-8 h-8 border-4 border-esther-blue border-t-transparent rounded-full mb-4" />
              <p className="text-sm text-ink-soft">
                LLM 正在读 {entries.length} 条日记,挑可写进简历的素材...
              </p>
              <p className="text-xs text-ink-muted mt-2 font-display italic">
                通常 5-10 秒
              </p>
            </div>
          )}

          {/* error */}
          {phase === "error" && (
            <div className="p-4 rounded-xl bg-esther-red/5 border border-esther-red/30">
              <p className="text-sm text-esther-red mb-2">⚠️ {errorMsg}</p>
              <button
                onClick={runMining}
                className="text-xs text-esther-blue hover:underline"
              >
                重试
              </button>
            </div>
          )}

          {/* result */}
          {phase === "result" && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-ink">
                  📦 挖到{" "}
                  <span className="text-esther-blue">{candidates.length}</span>{" "}
                  个候选 bullet
                </p>
                <button
                  onClick={runMining}
                  className="text-xs text-ink-muted hover:text-esther-blue transition-colors"
                >
                  ↻ 再挖一次
                </button>
              </div>

              {candidates.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-ink-soft mb-2">
                    暂时没挖到合适的简历素材
                  </p>
                  <p className="text-xs text-ink-muted leading-relaxed max-w-md mx-auto">
                    日记里可能多是情绪 / 流水账 — 试着写一些 "做了什么 · 推动了什么 · 学了什么" 的事
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {candidates.map((c, idx) => {
                    const confColor =
                      c.confidence === "high"
                        ? "bg-esther-blue text-white"
                        : c.confidence === "mid"
                        ? "bg-esther-yellow text-ink"
                        : "bg-warm-bg-deep text-ink-muted";
                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-xl border-2 border-border bg-card"
                      >
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${confColor}`}
                          >
                            {c.confidence === "high"
                              ? "✓ 高匹配"
                              : c.confidence === "mid"
                              ? "中匹配"
                              : "低匹配"}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-esther-blue/10 text-esther-blue">
                            {c.competency}
                          </span>
                        </div>
                        <p className="text-sm text-ink leading-relaxed mb-2 font-medium">
                          {c.bullet}
                        </p>
                        <p className="text-xs text-ink-muted italic mb-3 leading-relaxed">
                          挖自:{c.source_excerpt}
                        </p>
                        <button
                          onClick={() => handleCopy(idx, c.bullet)}
                          className="text-xs px-3 py-1.5 rounded-full border border-esther-blue/30 bg-card text-esther-blue hover:bg-esther-blue/5 transition-colors"
                        >
                          {copiedIdx === idx ? "✓ 已复制" : "📋 复制 bullet"}
                        </button>
                      </div>
                    );
                  })}
                  <p className="text-xs text-ink-muted text-center mt-3 italic">
                    ↑ 复制后,粘到 m3 简历编辑页(Phase 5)的「ASK AI」对话框,让 AI 帮你嵌进对应章节
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
