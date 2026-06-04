"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Nav } from "@/components/Nav";

const DRAFT_KEY = "m1_quiz_draft";
const LAST_ERROR_KEY = "m1_last_error";

export default function QuizErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    try {
      const payload = {
        message: error.message,
        digest: error.digest ?? null,
        stack: error.stack ?? null,
        ts: new Date().toISOString(),
      };
      window.localStorage.setItem(LAST_ERROR_KEY, JSON.stringify(payload));
    } catch {
      // localStorage 可能被禁,忽略
    }
    if (typeof console !== "undefined") {
      console.error("[m1/quiz] boundary caught:", error);
    }
  }, [error]);

  const handleResetDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
      window.localStorage.removeItem("riasec_result");
    } catch {
      // ignore
    }
    unstable_retry();
  };

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg flex flex-col items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-5xl mb-5">🛠️</p>
          <h2 className="text-xl font-bold text-ink mb-3">
            测评遇到一个小问题
          </h2>
          <p className="text-sm text-ink-soft leading-relaxed mb-6">
            可能是浏览器里残留了老格式数据,或者刚刚加载时卡了一下。
            <br />
            点下面任一按钮就能继续。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <button
              onClick={() => unstable_retry()}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              再试一次
            </button>
            <button
              onClick={handleResetDraft}
              className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-6 py-2.5 text-sm font-medium hover:border-esther-blue transition-colors"
            >
              清掉缓存,从头开始
            </button>
          </div>
          <Link
            href="/m1"
            className="text-xs text-ink-muted underline hover:text-esther-blue transition-colors"
          >
            ← 回测评入口
          </Link>

          {process.env.NODE_ENV !== "production" && (
            <details className="mt-8 text-left text-xs text-ink-muted">
              <summary className="cursor-pointer font-display italic">
                Dev: 错误详情
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-warm-bg-deep/60 overflow-x-auto whitespace-pre-wrap text-[11px]">
                {error.message}
                {error.digest ? `\n\ndigest: ${error.digest}` : ""}
                {error.stack ? `\n\n${error.stack}` : ""}
              </pre>
            </details>
          )}
        </div>
      </main>
    </>
  );
}
