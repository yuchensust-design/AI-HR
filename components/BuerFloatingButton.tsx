"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * 「不二」情绪陪伴机器人 — 右下角悬浮按钮(P1 stub)
 * v1 只显示悬浮 + 点击展开提示("即将上线"占位);Day 10 实装聊天能力
 * 详 PRD §3.8 + §3.6.5
 */

export function BuerFloatingButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="group fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-card border-2 border-esther-yellow shadow-lg pl-2 pr-5 py-2 hover:bg-warm-bg-deep transition-all"
        aria-label="找不二聊聊"
      >
        <div className="h-10 w-10 rounded-full overflow-hidden ring-2 ring-esther-blue bg-warm-bg">
          <Image
            src="/esther-assets/avatar.jpg"
            alt="不二"
            width={40}
            height={40}
            className="object-cover"
          />
        </div>
        <span className="text-sm font-medium text-ink">找不二聊聊</span>
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[340px] max-w-[calc(100vw-3rem)] bg-card border-2 border-esther-yellow rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-warm-bg-deep p-5 border-b border-border">
            <div className="flex items-center gap-3 mb-2">
              <Image
                src="/esther-assets/avatar.jpg"
                alt="不二"
                width={48}
                height={48}
                className="rounded-full ring-2 ring-esther-blue"
              />
              <div>
                <p className="font-semibold text-ink">不二</p>
                <p className="text-xs text-ink-muted">你的情绪小窝</p>
              </div>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed">
              学业 / 求职 / 自我怀疑 都可以跟我聊聊~
            </p>
          </div>

          <div className="p-5 space-y-3">
            <p className="text-xs text-ink-muted mb-1">常聊场景</p>
            {["面试焦虑了", "简历卡住了", "offer 被拒了", "又开始否定自己了"].map(
              (scene) => (
                <button
                  key={scene}
                  disabled
                  className="w-full text-left px-4 py-2.5 rounded-lg bg-warm-bg-deep text-ink-soft text-sm hover:bg-esther-yellow/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {scene}
                </button>
              )
            )}
            <p className="text-[11px] text-ink-muted pt-2 text-center">
              💛 即将上线 · 我们正在精调对话能力
            </p>
          </div>

          <button
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 text-ink-muted hover:text-ink text-xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
