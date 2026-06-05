"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import UserMenu from "@/components/auth/UserMenu";

/**
 * Sticky 顶部导航 — Landing v4
 * 默认透明(覆在 Hero 暖色上);滚动 > 50px 后白底 + backdrop-blur + border
 */

// 主流程 1-2-3-4 暗示用户从左到右走完闭环;辅助模块在右侧无编号。
// 评委一眼看出"完整闭环",新用户从左到右走即可。
const NAV_ITEMS = [
  { label: "1·找方向", href: "/m1" },
  { label: "2·看岗位", href: "/m6/discover" },
  { label: "3·改简历", href: "/m3" },
  { label: "4·练面试", href: "/m5" },
  { label: "经历", href: "/m2" },
  { label: "项目", href: "/m4" },
  { label: "日记", href: "/diary" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-warm-bg/90 backdrop-blur-md border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-[1300px] mx-auto px-6 h-20 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="#top" className="flex items-center gap-3 flex-shrink-0">
          <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-esther-yellow">
            <Image
              src="/esther-assets/avatar.jpg"
              alt="不二"
              width={44}
              height={44}
              className="object-cover"
            />
          </div>
          <span className="font-display italic text-2xl font-semibold text-esther-blue">
            Offer 捕手
          </span>
        </Link>

        {/* Center nav */}
        <div className="hidden md:flex items-center gap-5 lg:gap-6 text-sm lg:text-base text-ink-soft">
          {NAV_ITEMS.map((n) =>
            n.href.startsWith("#") ? (
              <a
                key={n.href}
                href={n.href}
                className="hover:text-esther-blue transition-colors whitespace-nowrap"
              >
                {n.label}
              </a>
            ) : (
              <Link
                key={n.href}
                href={n.href}
                className="hover:text-esther-blue transition-colors whitespace-nowrap"
              >
                {n.label}
              </Link>
            )
          )}
        </div>

        {/* Right cluster: CTA + UserMenu */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link
            href="/m1"
            className="hidden sm:inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm"
          >
            开始使用 →
          </Link>
          <UserMenu />
        </div>
      </div>
    </nav>
  );
}
