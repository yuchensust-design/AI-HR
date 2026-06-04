"use client";

import { useEffect, useState } from "react";

/**
 * 量化指标条 — label + value%(挂载后延迟动画填充)
 * 用在 5 阶段切换的 StepDetailCard 右侧
 *
 * 切换 step 时由父组件用 key prop 强制重建实例,initial width 自然为 0,
 * 再由本组件 mount 后的 timer 启动 transition 到 target。
 */

type Props = {
  label: string;
  value: number; // 0-100
};

export function MetricBar({ label, value }: Props) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setWidth(value), 80);
    return () => window.clearTimeout(id);
  }, [value]);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className="text-base font-bold text-esther-blue font-display italic leading-none">
          {value}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-warm-bg-deep overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-esther-blue/70 to-esther-blue rounded-full transition-all duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
