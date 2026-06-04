"use client";

type Props = {
  isAllSample: boolean;
  sampleCount: number;
  realCount: number;
  onSwitchToMyData: () => void;
  onRestoreSample: () => void;
};

export function SampleBanner({
  isAllSample,
  sampleCount,
  realCount,
  onSwitchToMyData,
  onRestoreSample,
}: Props) {
  if (isAllSample) {
    return (
      <div className="rounded-xl border border-esther-yellow/50 bg-esther-yellow/10 px-4 py-3 text-sm text-ink-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="font-semibold text-ink mt-0.5">示例数据</span>
          <span>
            当前展示的是 {sampleCount} 条示例投递,只为让你看清楚指标卡和诊断的形态。
            <span className="ml-1 text-ink-muted">
              真实记录 0 条 — 切到我的数据后,这些示例会被清空。
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onSwitchToMyData}
          className="self-start sm:self-auto inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark whitespace-nowrap"
        >
          清空示例,开始记录我的数据 →
        </button>
      </div>
    );
  }

  // 用户已切到真实数据;给一个柔和的"恢复示例数据"链接,以及来源标识
  return (
    <div className="rounded-xl border border-border bg-warm-bg/60 px-4 py-3 text-sm text-ink-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <span>
        当前数据:真实 {realCount} 条
        {sampleCount > 0 ? (
          <span className="text-ink-muted"> · 含 {sampleCount} 条示例</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onRestoreSample}
        className="text-esther-blue hover:text-esther-blue-dark text-sm underline-offset-2 hover:underline self-start sm:self-auto"
      >
        恢复示例数据
      </button>
    </div>
  );
}
