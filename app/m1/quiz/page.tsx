"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";

/**
 * 模块 1 测评答题页(简化原型版,5 题示意)
 * 路由 /m1/quiz
 * 完成后 setItem('riasec_result') + redirect /m1/result
 *
 * 注:v1 原型阶段,答题不真实计算 RIASEC(后端实装时做),
 * 这里 5 题走完即可,localStorage 记录"完成过"标识,
 * result 页显示陈昊 sample 数据(已 lock 在 plan)。
 */

const QUESTIONS = [
  {
    no: 1,
    text: "周末有空,你更想做什么?",
    options: [
      { label: "A", text: "修家里坏掉的东西 / DIY 做点小物件" },
      { label: "B", text: "户外运动(跑步 / 爬山 / 打球)" },
      { label: "C", text: "把家里收拾归位,东西分类" },
      { label: "D", text: "帮朋友搬家或修个东西" },
    ],
  },
  {
    no: 2,
    text: "看到一个有意思的现象,你的第一反应是?",
    options: [
      { label: "A", text: "找资料 / 查论文 弄清楚原理" },
      { label: "B", text: "自己想几个假设,慢慢验证" },
      { label: "C", text: "跟懂行的人聊,听他们怎么看" },
      { label: "D", text: "等下次再观察,先放着" },
    ],
  },
  {
    no: 3,
    text: "团队做项目时,你最常的角色是?",
    options: [
      { label: "A", text: "主动提议方向,带大家走" },
      { label: "B", text: "协调资源,确保事情推进" },
      { label: "C", text: "跟外部沟通争取支持" },
      { label: "D", text: "找最高效的方法做事" },
    ],
  },
  {
    no: 4,
    text: "朋友遇到困难,你通常?",
    options: [
      { label: "A", text: "主动找 ta 聊聊,听 ta 说" },
      { label: "B", text: "给 ta 出主意,帮 ta 想办法" },
      { label: "C", text: "拉 ta 一起做点事,转移注意力" },
      { label: "D", text: "默默关心,需要时再出现" },
    ],
  },
  {
    no: 5,
    text: "你对哪些有强烈兴趣?(可多选,沾边都算)",
    multi: true,
    options: [
      { label: "🎵", text: "音乐(听歌 / 弹琴 / 鉴赏)" },
      { label: "📸", text: "摄影与影像(拍照 / 剪片)" },
      { label: "🎮", text: "游戏与二次元" },
      { label: "✍️", text: "内容创作(写作 / 视频 / 播客)" },
      { label: "🍳", text: "美食(烹饪 / 探店)" },
      { label: "🎨", text: "设计(UI / 平面 / 产品)" },
      { label: "📊", text: "数据 & AI" },
    ],
  },
];

const TOTAL = 19; // 真实题数(原型只展示 5 题示意)

export default function Module1QuizPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | string[]>>({});

  const q = QUESTIONS[current];
  const isLast = current === QUESTIONS.length - 1;
  const isMulti = q.multi;
  const currentAnswer = answers[q.no];
  const hasAnswer = isMulti
    ? Array.isArray(currentAnswer) && currentAnswer.length > 0
    : !!currentAnswer;

  const selectSingle = (label: string) => {
    setAnswers({ ...answers, [q.no]: label });
  };

  const toggleMulti = (label: string) => {
    const cur = (answers[q.no] as string[]) || [];
    const next = cur.includes(label)
      ? cur.filter((x) => x !== label)
      : [...cur, label];
    setAnswers({ ...answers, [q.no]: next });
  };

  const handleNext = () => {
    if (isLast) {
      // 完成测评,存 localStorage,跳 result
      localStorage.setItem(
        "riasec_result",
        JSON.stringify({
          completedAt: new Date().toISOString(),
          answers,
          // v1 原型用 sample 陈昊数据 (后端实装时真算 RIASEC)
          riasec: [5, 8, 4, 6, 9, 5],
          riasecCode: "E9 I8 S6 R5 C5 A4",
        })
      );
      router.push("/m1/result");
    } else {
      setCurrent(current + 1);
    }
  };

  const handlePrev = () => {
    if (current > 0) setCurrent(current - 1);
  };

  const handleSkip = () => {
    handleNext();
  };

  // 进度(原型展示:5 题 = 100%,因为只做 5 题示意;真版本是 19 题)
  const progress = ((current + 1) / QUESTIONS.length) * 100;

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {/* 顶部进度 */}
        <section className="border-b border-border bg-card sticky top-20 z-10">
          <div className="max-w-[800px] mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <Link
                href="/m1"
                className="text-xs text-ink-soft hover:text-esther-blue transition-colors"
              >
                ← 退出测评(进度会丢)
              </Link>
              <p className="text-xs text-ink-muted font-display italic">
                {current + 1} / {QUESTIONS.length}
                <span className="text-ink-muted/60">
                  {" "}
                  · 完整 {TOTAL} 题(原型展示前 5)
                </span>
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-warm-bg-deep overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-esther-blue to-esther-yellow transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </section>

        {/* 题目卡 */}
        <div className="max-w-[800px] mx-auto px-6 py-12">
          <Card className="p-8 md:p-10 border-2 border-border">
            <p className="font-display italic text-xs text-esther-blue mb-3">
              Question {q.no}
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-ink mb-6 leading-snug">
              {q.text}
            </h2>

            {/* 选项 */}
            <div className={`space-y-3 ${isMulti ? "" : ""}`}>
              {q.options.map((opt) => {
                const selected = isMulti
                  ? Array.isArray(currentAnswer) &&
                    currentAnswer.includes(opt.label)
                  : currentAnswer === opt.label;
                return (
                  <button
                    key={opt.label}
                    onClick={() =>
                      isMulti
                        ? toggleMulti(opt.label)
                        : selectSingle(opt.label)
                    }
                    className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      selected
                        ? "border-esther-blue bg-esther-blue/5"
                        : "border-border bg-card hover:border-esther-blue/50"
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        selected
                          ? "bg-esther-blue text-white"
                          : "bg-warm-bg-deep text-ink-muted"
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="flex-1 text-sm text-ink leading-relaxed pt-1">
                      {opt.text}
                    </span>
                  </button>
                );
              })}
            </div>

            {isMulti && (
              <p className="text-xs text-ink-muted mt-4 font-display italic">
                * 多选 · 选越多越能精准推荐
              </p>
            )}
          </Card>

          {/* 控件 */}
          <div className="flex items-center justify-between mt-6 gap-4">
            <button
              onClick={handlePrev}
              disabled={current === 0}
              className="px-5 py-2.5 rounded-full border border-border bg-card text-sm text-ink-soft hover:border-esther-blue transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← 上一题
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSkip}
                className="px-4 py-2.5 text-sm text-ink-muted hover:text-ink-soft transition-colors"
              >
                跳过这题
              </button>
              <button
                onClick={handleNext}
                disabled={!hasAnswer}
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLast ? "完成 → 看推荐" : "下一题 →"}
              </button>
            </div>
          </div>

          <p className="text-xs text-ink-muted text-center mt-6 font-display italic">
            * 原型只展示 5 题(覆盖 RIASEC 4 维 + 兴趣 tag)·
            正式版 19 题约 3-4 分钟做完
          </p>
        </div>
      </main>
    </>
  );
}
