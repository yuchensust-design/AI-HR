"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState } from "@/lib/use-local-state";
import {
  Application,
  ApplicationStatus,
  Diagnosis,
  DIRECTION_LABELS,
  RoleDirection,
  STATUS_COLORS,
  STATUS_LABELS,
  TRACKER_STORAGE_KEYS,
} from "@/lib/tracker-types";
import { SAMPLE_APPLICATIONS, SAMPLE_DIAGNOSIS } from "@/lib/tracker-sample";
import { computeMetrics } from "@/lib/tracker-metrics";
import { useTrackerDBSync } from "@/lib/sync/useTrackerDBSync";

import { MetricsCards } from "./components/MetricsCards";
import { DirectionBarChart } from "./components/DirectionBarChart";
import { ApplicationTable } from "./components/ApplicationTable";
import { ApplicationForm } from "./components/ApplicationForm";
import { DiagnosisPanel } from "./components/DiagnosisPanel";

const DIRECTION_KEYS = Object.keys(DIRECTION_LABELS) as RoleDirection[];
const STATUS_FILTER_KEYS: ApplicationStatus[] = [
  "applied", "written_test", "interview", "offer", "rejected", "ghosted",
];

// offer/面试/笔试/已投递 排前面，拒绝/已挂 沉底
const STATUS_PRIORITY: Record<ApplicationStatus, number> = {
  offer: 0,
  interview: 1,
  written_test: 2,
  applied: 3,
  to_apply: 4,
  rejected: 5,
  ghosted: 6,
};

export default function TrackerPage() {
  const [applications, setApplications] = useLocalState<Application[]>(
    TRACKER_STORAGE_KEYS.APPLICATIONS,
    [],
  );
  const [diagnosis, setDiagnosis] = useLocalState<Diagnosis | null>(
    TRACKER_STORAGE_KEYS.DIAGNOSIS_CACHE,
    null,
  );
  const { upsertApplication, deleteApplication, loadFromDB, userLoading } =
    useTrackerDBSync();

  const [editing, setEditing] = useState<Application | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingSample, setViewingSample] = useState(false);

  // 筛选 + 分页状态
  const [filterDirection, setFilterDirection] = useState<RoleDirection | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ApplicationStatus | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // 必须等 auth 落定再 loadFromDB:首帧 user 未 resolve → loadFromDB 返回 null,
  // 若 deps=[] 则永不重试,登录用户在新设备/清缓存后云端记录读不回(空表)。
  // 改为 userLoading 门控 + 随 loadFromDB(随 user 变)重跑,对齐 useM2/M3DBSync。
  useEffect(() => {
    if (userLoading) return;
    loadFromDB().then((dbApps) => {
      if (dbApps && dbApps.length > 0) setApplications(dbApps);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, loadFromDB]);

  const displayApplications = viewingSample ? SAMPLE_APPLICATIONS : applications;
  const metrics = useMemo(() => computeMetrics(displayApplications), [displayApplications]);
  const isEmpty = applications.length === 0 && !viewingSample;

  // 筛选后的方向列表（只显示当前数据中存在的方向）
  const activeDirections = useMemo(() => {
    const dirs = new Set(displayApplications.map((a) => a.direction));
    return DIRECTION_KEYS.filter((d) => dirs.has(d));
  }, [displayApplications]);

  // 筛选后的状态列表（只显示当前数据中存在的状态）
  const activeStatuses = useMemo(() => {
    const statuses = new Set(displayApplications.map((a) => a.status));
    return STATUS_FILTER_KEYS.filter((s) => statuses.has(s));
  }, [displayApplications]);

  const sortedApps = useMemo(
    () => [...displayApplications].sort((a, b) => {
      const pd = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (pd !== 0) return pd;
      return b.statusUpdatedAt.localeCompare(a.statusUpdatedAt);
    }),
    [displayApplications],
  );

  const filteredApps = useMemo(() => {
    return sortedApps
      .filter((a) => filterDirection === "all" || a.direction === filterDirection)
      .filter((a) => filterStatus === "all" || a.status === filterStatus);
  }, [sortedApps, filterDirection, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredApps.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedApps = filteredApps.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetFilters() {
    setFilterDirection("all");
    setFilterStatus("all");
    setCurrentPage(1);
  }
  function enterSample() { setViewingSample(true); resetFilters(); }
  function exitSample() { setViewingSample(false); resetFilters(); }

  function handleAddOrEdit(a: Application) {
    setViewingSample(false);
    setApplications((prev) => {
      const exists = prev.some((p) => p.id === a.id);
      if (exists) return prev.map((p) => (p.id === a.id ? a : p));
      return [a, ...prev];
    });
    setShowForm(false);
    setEditing(null);
    setDiagnosis(null);
    void upsertApplication(a);
  }

  function handleDelete(id: string) {
    setApplications((prev) => prev.filter((p) => p.id !== id));
    setDiagnosis(null);
    void deleteApplication(id);
  }

  async function runDiagnosis() {
    if (displayApplications.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tracker/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applications: displayApplications }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`诊断接口返回 ${res.status}:${txt.slice(0, 120)}`);
      }
      const data = (await res.json()) as Diagnosis;
      setDiagnosis(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "诊断失败，稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  const pillBase = "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer";
  const pillActive = "bg-esther-blue border-esther-blue text-white";
  const pillInactive = "border-border bg-card text-ink-soft hover:border-esther-blue/50 hover:text-ink";

  return (
    <div className="min-h-screen bg-warm-bg text-ink pb-24">
      <Nav />

      <main className="max-w-[1100px] mx-auto px-6 pt-28 sm:pt-32 space-y-6">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold text-ink leading-tight mb-3">
              你卡在投递、面试,还是方向?
            </h1>
            <p className="text-base text-ink-soft leading-relaxed">
              记录每次投递的真实结果，积累够了 AI 帮你找到卡点，告诉你该去改简历还是练面试。
            </p>
          </div>
          {!viewingSample && (
            <button
              type="button"
              onClick={enterSample}
              className="flex-shrink-0 mt-1 text-xs text-ink-muted hover:text-esther-blue border border-border rounded-lg px-3 py-2 whitespace-nowrap"
            >
              查看示例效果 →
            </button>
          )}
        </header>

        {/* 示例预览 banner */}
        {viewingSample && (
          <div className="flex items-center justify-between text-xs text-ink-muted border-b border-border pb-3">
            <span>📋 示例预览中 — 以下是模拟数据，帮你了解模块功能</span>
            <button
              type="button"
              onClick={exitSample}
              className="text-esther-blue hover:underline ml-4 whitespace-nowrap flex-shrink-0"
            >
              退出示例，开始记录我的数据 →
            </button>
          </div>
        )}

        {/* 转化漏斗 */}
        {!isEmpty && (
          <section>
            <h2 className="font-bold text-base text-ink mb-3">转化漏斗</h2>
            <MetricsCards metrics={metrics} sampleMode={viewingSample} />
          </section>
        )}

        {/* 投递记录 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-ink">投递记录</h2>
            {!viewingSample && (
              <button
                type="button"
                onClick={() => { setEditing(null); setShowForm(true); }}
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark"
              >
                + 新增投递
              </button>
            )}
          </div>

          {isEmpty ? (
            <div className="rounded-xl border border-dashed border-border bg-warm-bg/40 px-6 py-12 text-center space-y-4">
              <p className="text-sm text-ink-muted">
                还没有投递记录，每投一份就来记一条，积累几条后 AI 帮你看规律。
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => { setEditing(null); setShowForm(true); }}
                  className="rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark"
                >
                  + 新增第一条投递
                </button>
                <button
                  type="button"
                  onClick={enterSample}
                  className="text-sm text-ink-muted hover:text-esther-blue underline-offset-2 hover:underline"
                >
                  先看看示例效果
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 筛选条 */}
              <div className="space-y-2 mb-4">
                {/* 方向筛选 */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-ink-muted mr-1">方向</span>
                  <button
                    type="button"
                    onClick={() => { setFilterDirection("all"); setCurrentPage(1); }}
                    className={`${pillBase} ${filterDirection === "all" ? pillActive : pillInactive}`}
                  >
                    全部
                  </button>
                  {activeDirections.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setFilterDirection(filterDirection === d ? "all" : d); setCurrentPage(1); }}
                      className={`${pillBase} ${filterDirection === d ? pillActive : pillInactive}`}
                    >
                      {DIRECTION_LABELS[d]}
                    </button>
                  ))}
                </div>

                {/* 状态筛选 */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-ink-muted mr-1">状态</span>
                  <button
                    type="button"
                    onClick={() => { setFilterStatus("all"); setCurrentPage(1); }}
                    className={`${pillBase} ${filterStatus === "all" ? pillActive : pillInactive}`}
                  >
                    全部
                  </button>
                  {activeStatuses.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setFilterStatus(filterStatus === s ? "all" : s); setCurrentPage(1); }}
                      className={`${pillBase} ${filterStatus === s ? `ring-1 ${STATUS_COLORS[s]}` : pillInactive}`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>

                {/* 筛选结果计数 */}
                {(filterDirection !== "all" || filterStatus !== "all") && (
                  <p className="text-xs text-ink-muted">
                    筛选结果：{filteredApps.length} 条
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="ml-2 text-esther-blue hover:underline"
                    >
                      清除筛选
                    </button>
                  </p>
                )}
              </div>

              <ApplicationTable
                applications={pagedApps}
                onEdit={viewingSample ? () => {} : (a) => { setEditing(a); setShowForm(true); }}
                onDelete={viewingSample ? () => {} : handleDelete}
              />

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className="text-xs text-ink-muted">
                    第 {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredApps.length)} 条，共 {filteredApps.length} 条
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink-soft hover:text-ink disabled:opacity-40"
                    >
                      ← 上一页
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                      .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        p === "…" ? (
                          <span key={`ellipsis-${idx}`} className="px-1 text-xs text-ink-muted">…</span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setCurrentPage(p as number)}
                            className={`rounded-lg border px-3 py-1.5 text-xs ${
                              safePage === p
                                ? "border-esther-blue bg-esther-blue text-white"
                                : "border-border text-ink-soft hover:text-ink"
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink-soft hover:text-ink disabled:opacity-40"
                    >
                      下一页 →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* 方向对比 */}
        {!isEmpty && metrics.byDirection.length > 1 && (
          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold text-base text-ink mb-1">按方向对比</h2>
            <p className="text-xs text-ink-muted mb-4">
              同一份简历投不同方向，转化差距大时说明方向比简历更需要先解决。
            </p>
            <DirectionBarChart rows={metrics.byDirection} />
          </section>
        )}

        {/* AI 诊断 */}
        {!isEmpty && (
          <section>
            <DiagnosisPanel
              diagnosis={viewingSample ? SAMPLE_DIAGNOSIS : diagnosis}
              loading={loading}
              error={error}
              applicationsCount={displayApplications.length}
              onRun={viewingSample ? () => {} : runDiagnosis}
              sampleMode={viewingSample}
            />
          </section>
        )}
      </main>

      {showForm && (
        <ApplicationForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSubmit={handleAddOrEdit}
        />
      )}

      <BuerFloatingButton />
    </div>
  );
}
