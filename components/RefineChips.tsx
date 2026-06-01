"use client";

import { useState } from "react";

/**
 * Chip 修推荐
 * - 横向 scroll 4-6 chip
 * - 点击 → 触发 onRefine(chip)
 * - loading 时禁用所有 chip
 *
 * 设计意图:让用户 in-place 调整推荐(plan §8.16 §B Q2 lock)
 */

export function RefineChips({
  chips,
  onRefine,
  disabled = false,
}: {
  chips: string[];
  onRefine: (chip: string) => void;
  disabled?: boolean;
}) {
  const [clicked, setClicked] = useState<string | null>(null);

  if (!chips || chips.length === 0) return null;

  const handleClick = (chip: string) => {
    setClicked(chip);
    onRefine(chip);
  };

  return (
    <section className="border-b border-border bg-warm-bg-deep/30">
      <div className="max-w-[1100px] mx-auto px-6 py-10">
        <p className="font-display italic text-xs text-esther-blue mb-2">
          Not quite right?
        </p>
        <h3 className="text-lg font-bold text-ink mb-1">想调整推荐?</h3>
        <p className="text-sm text-ink-soft mb-5">
          点一个选项,不二会重新挑 ~(每小时最多 5 次)
        </p>

        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {chips.map((chip) => {
            const isClicked = clicked === chip;
            return (
              <button
                key={chip}
                onClick={() => handleClick(chip)}
                disabled={disabled}
                className={`flex-shrink-0 px-5 py-2.5 rounded-full border-2 text-sm font-medium transition-all whitespace-nowrap ${
                  isClicked && disabled
                    ? "border-esther-blue bg-esther-blue text-white"
                    : "border-border bg-card text-ink hover:border-esther-blue hover:bg-esther-blue/5"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
