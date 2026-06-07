"use client";

type Props = {
  isAllSample: boolean;
  sampleCount: number;
  realCount: number;
  onSwitchToMyData: () => void;
  onRestoreSample: () => void;
};

export function SampleBanner({ isAllSample, onSwitchToMyData }: Props) {
  if (!isAllSample) return null;

  return (
    <div className="flex items-center justify-between text-xs text-ink-muted border-b border-border pb-3">
      <span>📋 当前为示例数据，方便你直观看到模块的完整功能</span>
      <button
        type="button"
        onClick={onSwitchToMyData}
        className="text-esther-blue hover:underline ml-4 whitespace-nowrap flex-shrink-0"
      >
        清空，开始记录我的数据 →
      </button>
    </div>
  );
}
