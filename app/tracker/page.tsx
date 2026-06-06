"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState } from "@/lib/use-local-state";
import {
  Application,
  Diagnosis,
  TRACKER_STORAGE_KEYS,
} from "@/lib/tracker-types";
import { SAMPLE_APPLICATIONS } from "@/lib/tracker-sample";
import { computeMetrics } from "@/lib/tracker-metrics";

import { SampleBanner } from "./components/SampleBanner";
import { MetricsCards } from "./components/MetricsCards";
import { DirectionBarChart } from "./components/DirectionBarChart";
import { ApplicationTable } from "./components/ApplicationTable";
import { ApplicationForm } from "./components/ApplicationForm";
import { DiagnosisPanel } from "./components/DiagnosisPanel";
import { NextActions } from "./components/NextActions";
import { TrackerInsights } from "./components/TrackerInsights";
import Link from "next/link";

export default function TrackerPage() {
  const [applications, setApplications] = useLocalState<Application[]>(
    TRACKER_STORAGE_KEYS.APPLICATIONS,
    SAMPLE_APPLICATIONS,
  );
  const [usingRealData, setUsingRealData] = useLocalState<boolean>(
    TRACKER_STORAGE_KEYS.USING_REAL_DATA,
    false,
  );
  const [diagnosis, setDiagnosis] = useLocalState<Diagnosis | null>(
    TRACKER_STORAGE_KEYS.DIAGNOSIS_CACHE,
    null,
  );

  const [editing, setEditing] = useState<Application | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metrics = useMemo(() => computeMetrics(applications), [applications]);
  const isAllSample = applications.every((a) => a.isSample);

  // 用户首次操作(新增/编辑)时,如果当前还全是 sample,自动清空 sample,只留新增的真实记录
  function handleAddOrEdit(a: Application) {
    setApplications((prev) => {
      const exists = prev.some((p) => p.id === a.id);
      if (exists) {
        return prev.map((p) => (p.id === a.id ? a : p));
      }
      // 新增:如果当前全是 sample 且用户还没切到真实数据,先清空 sample
      if (!usingRealData && prev.every((p) => p.isSample)) {
        return [a];
      }
      return [a, ...prev];
    });
    if (!usingRealData) setUsingRealData(true);
    setShowForm(false);
    setEditing(null);
    // 数据变了,清掉旧诊断
    setDiagnosis(null);
  }

  function handleDelete(id: string) {
    setApplications((prev) => prev.filter((p) => p.id !== id));
    setDiagnosis(null);
  }

  function handleSwitchToMyData() {
    setApplications([]);
    setUsingRealData(true);
    setDiagnosis(null);
  }

  function handleRestoreSample() {
    setApplications(SAMPLE_APPLICATIONS);
    setUsingRealData(false);
    setDiagnosis(null);
  }

  async function runDiagnosis() {
    if (applications.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tracker/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applications }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`诊断接口返回 ${res.status}:${txt.slice(0, 120)}`);
      }
      const data = (await res.json()) as Diagnosis;
      setDiagnosis(data);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? `${e.message} — 已尝试本地规则版兜底,如果仍报错请重试。`
          : "诊断失败,稍后再试。",
      );
    } finally {
      setLoading(false);
    }
  }

  // 给"已挂率高"时的不二柔和提示;阈值跟规则版诊断对齐
  const ghostedHigh = metrics.applied >= 5 && metrics.ghostedRate >= 0.4;

  // 默认时间排序:状态更新日倒序
  const sortedApps = useMemo(
    () =>
      [...applications].sort((a, b) =>
        b.statusUpdatedAt.localeCompare(a.statusUpdatedAt),
      ),
    [applications],
  );

  // 状态分布(漏斗,用于子标题)
  return (
    <div className="min-h-screen bg-warm-bg text-ink pb-24">
      <Nav />

      <main className="max-w-[1100px] mx-auto px-6 pt-28 sm:pt-32 space-y-8">
        {/* Hero */}
        <header className="space-y-3">
          <div className="text-xs text-ink-muted tracking-wide uppercase">
            DATA · 投递追踪 + 求职诊断
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl text-ink leading-tight">
            把投递结果变成下一步判断
          </h1>
          <p className="text-ink-soft leading-relaxed max-w-2xl">
            不是只记录投了多少份,而是看回复率、面试转化和方向差异 —
            判断问题到底出在
            <span className="text-ink font-medium"> 方向、简历,还是面试</span>。
            数据全部存在你浏览器本地,AI 诊断时只会读这份脱敏的指标快照(不含公司名)。
          </p>
          {/* §8.28 Wave 5: tracker → m5/debrief 反向联动入口 */}
          <div className="flex gap-3 flex-wrap pt-2">
            <Link
              href="/m5/debrief"
              className="inline-flex items-center text-xs text-esther-blue hover:text-esther-blue-dark hover:underline"
            >
              🎤 看上一次面试复盘 →
            </Link>
            <Link
              href="/m3"
              className="inline-flex items-center text-xs text-esther-blue hover:text-esther-blue-dark hover:underline"
            >
              📝 回简历整理 →
            </Link>
          </div>
        </header>

        <SampleBanner
          isAllSample={isAllSample}
          sampleCount={metrics.sampleCount}
          realCount={metrics.realCount}
          onSwitchToMyData={handleSwitchToMyData}
          onRestoreSample={handleRestoreSample}
        />

        {/* 指标卡 */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-xl text-ink">指标快照</h2>
            <span className="text-xs text-ink-muted">
              已投递 = 已经投出的样本(不含"待投递")
            </span>
          </div>
          <MetricsCards metrics={metrics} />
        </section>

        {/* 方向对比 */}
        <section className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
          <div>
            <h2 className="font-heading text-xl text-ink">按方向对比</h2>
            <p className="text-xs text-ink-muted mt-1">
              同样的简历投不同方向,转化可能差很多 — 这是判断"方向问题 vs 简历问题"最直接的视图。
            </p>
          </div>
          <DirectionBarChart rows={metrics.byDirection} />
        </section>

        {/* 投递记录 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl text-ink">投递记录</h2>
              <p className="text-xs text-ink-muted">
                只记录"行业 + 职位类型",不收集公司信息。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark"
            >
              + 新增投递
            </button>
          </div>
          <ApplicationTable
            applications={sortedApps}
            onEdit={(a) => {
              setEditing(a);
              setShowForm(true);
            }}
            onDelete={handleDelete}
          />
        </section>

        {/* 复盘 Insights — §8.28 Wave 3 投递复盘补完 */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-xl text-ink">复盘卡点</h2>
            <span className="text-xs text-ink-muted">
              基于你填的"挂了 + 原因"自动聚合
            </span>
          </div>
          <TrackerInsights applications={applications} />
        </section>

        {/* 诊断 */}
        <section>
          <DiagnosisPanel
            diagnosis={diagnosis}
            loading={loading}
            error={error}
            applicationsCount={applications.length}
            onRun={runDiagnosis}
          />
        </section>

        {/* 下一步 */}
        <section className="space-y-3">
          <h2 className="font-heading text-xl text-ink">回到 Offer 捕手主流程</h2>
          <NextActions metrics={metrics} ghostedHigh={ghostedHigh} />
        </section>
      </main>

      {showForm && (
        <ApplicationForm
          initial={editing}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSubmit={handleAddOrEdit}
        />
      )}

      <BuerFloatingButton />
    </div>
  );
}
