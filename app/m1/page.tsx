"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * 模块 1 入口页 (router)
 * 路由 /m1
 * 逻辑:
 *   - localStorage 有 riasec_result → 自动 redirect /m1/result
 *   - 无 → 显示 entry(欢迎 + 开始测评 CTA + 看 sample 链接给评委)
 */

export default function Module1EntryPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // 检查 localStorage 是否有测评结果
    const result = localStorage.getItem("riasec_result");
    if (result) {
      router.replace("/m1/result");
    } else {
      setChecked(true); // 没结果,显示 entry
    }
  }, [router]);

  // 检查中显示骨架
  if (!checked) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center">
          <p className="text-sm text-ink-muted font-display italic">加载中...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <section className="border-b border-border">
          <div className="max-w-[900px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 01 · 兴趣岗位发现
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              先让我了解一下你
            </h1>
            <p className="text-ink-soft text-sm">
              18 题 RIASEC 测评 + 1 题兴趣 tag · 3-4 分钟 · 然后给你 3-5 个可能适合的方向
            </p>
          </div>
        </section>

        <div className="max-w-[900px] mx-auto px-6 py-12">
          {/* 主 CTA 卡 */}
          <Card className="p-8 md:p-10 border-2 border-esther-blue/30 bg-esther-blue/5 mb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="flex-1">
                <p className="font-display italic text-xs text-esther-blue mb-2">
                  Ready to start
                </p>
                <h2 className="text-xl md:text-2xl font-bold text-ink mb-2 leading-snug">
                  开始测评 — 19 题,3-4 分钟
                </h2>
                <p className="text-sm text-ink-soft leading-relaxed">
                  基于霍兰德 RIASEC 职业兴趣理论 · 每题 4 选项,可跳过 ·
                  完成后给你 3-5 个推荐方向 + 为什么
                </p>
              </div>
              <Link
                href="/m1/quiz"
                className="flex-shrink-0 inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-7 py-3.5 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md whitespace-nowrap"
              >
                开始测评 →
              </Link>
            </div>
          </Card>

          {/* 次要选项 — 看 sample */}
          <Card className="p-6 border border-border bg-warm-bg-deep/30">
            <div className="flex items-start gap-4">
              <span className="text-2xl flex-shrink-0">👀</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink mb-1">
                  想先看看测评结果长什么样?
                </p>
                <p className="text-xs text-ink-soft leading-relaxed mb-3">
                  我们准备了一个 sample(陈昊,CS 大四,冲字节 AI PM)— 你可以直接看推荐方向和雷达图,
                  之后再决定要不要做自己的测评。
                </p>
                <Link
                  href="/m1/result"
                  className="inline-flex items-center gap-1 text-sm font-medium text-esther-blue hover:underline"
                >
                  看一个 sample 结果 →
                </Link>
              </div>
            </div>
          </Card>

          {/* 隐私小字 */}
          <p className="text-xs text-ink-muted text-center mt-8 font-display italic leading-relaxed">
            🔒 测评数据存浏览器本地 · 我们后端不存 ·
            <br />
            你随时可以「重新测一次」或「清除我的数据」
          </p>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
