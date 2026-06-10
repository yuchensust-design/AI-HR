"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 首页 banner — M6 智能岗位匹配入口
 *
 * 位置:Hero 区下方,首屏高位露出。两种入口:
 *   ① 输入岗位+城市 直接搜
 *   ② 上传简历 让 AI 推荐
 */

const POPULAR_CITIES = [
  "上海",
  "北京",
  "深圳",
  "广州",
  "杭州",
  "成都",
  "南京",
  "武汉",
  "西安",
  "全国",
];

export function JobMatchHero() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [city, setCity] = useState("上海");

  function go(search: string) {
    const params = new URLSearchParams();
    if (search) params.set("role", search);
    if (city) params.set("city", city);
    router.push(`/m6/discover?${params.toString()}`);
  }

  return (
    <section className="bg-gradient-to-br from-esther-yellow/30 via-warm-bg-deep to-esther-blue/10 border-y-2 border-esther-blue/20 relative overflow-hidden">
      {/* 装饰大字 */}
      <div className="pointer-events-none absolute -right-8 -top-8 select-none leading-none font-display italic text-[clamp(7rem,15vw,15rem)] text-esther-blue/[0.08]">
        M6
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-14 relative">
        <div className="text-center mb-7">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            See real jobs
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            🎯 看真实岗位 + AI 推荐最匹配的机会
          </h2>
          <p className="text-ink-soft text-sm max-w-2xl mx-auto">
            从前程无忧、猎聘、智联招聘实时抓取在招岗位,AI 帮你按简历打分、推荐、解释为什么适合
          </p>
        </div>

        <div className="bg-card rounded-3xl border-2 border-border shadow-md p-6 max-w-3xl mx-auto">
          {/* 关键词搜索 */}
          <div>
            <label className="text-xs font-semibold text-ink-soft mb-2 block uppercase tracking-wide">
              ① 输入岗位看真实在招
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && role && go(role)}
                placeholder="岗位名,如 产品经理 / 前端工程师"
                className="flex-1 px-4 py-2.5 rounded-lg border-2 border-border focus:border-esther-blue focus:outline-none text-sm bg-warm-bg"
              />
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="px-4 py-2.5 rounded-lg border-2 border-border focus:border-esther-blue focus:outline-none text-sm bg-warm-bg min-w-[100px]"
              >
                {POPULAR_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                disabled={!role.trim()}
                onClick={() => go(role)}
                className="px-6 py-2.5 rounded-lg bg-esther-blue text-white font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                搜索 →
              </button>
            </div>
          </div>

          <div className="flex items-center my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="px-3 text-xs text-ink-muted font-display italic">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* 简历推荐 */}
          <div>
            <label className="text-xs font-semibold text-ink-soft mb-2 block uppercase tracking-wide">
              ② 让 AI 用你的简历推荐
            </label>
            <button
              onClick={() => router.push("/m6/discover?mode=match-resume")}
              className="w-full px-6 py-3 rounded-lg bg-esther-yellow text-ink font-semibold hover:bg-esther-yellow/80 transition-colors text-sm border-2 border-esther-yellow/60"
            >
              ✨ 用我的简历智能匹配岗位 →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
