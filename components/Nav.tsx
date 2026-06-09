"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import UserMenu from "@/components/auth/UserMenu";

/**
 * Sticky 顶部导航 — Landing v4
 * 默认透明(覆在 Hero 暖色上);滚动 > 50px 后白底 + backdrop-blur + border
 *
 * §8.28 fix: 去掉 1·2·3·4 编号前缀 + active item 底部 esther-blue 下划线
 */

const NAV_ITEMS = [
  { label: "找方向", href: "/m1" },
  { label: "看岗位", href: "/m6/discover" },
  { label: "改简历", href: "/m3" },
  { label: "练面试", href: "/m5" },
  { label: "复盘投递", href: "/tracker" },
  { label: "挖经历", href: "/m2" },
  { label: "项目", href: "/m4" },
  { label: "日记", href: "/diary" },
];

/** 判断当前 path 是否在某个 nav item 的子树下 — eg /m3/result 命中 /m3 */
function isNavActive(pathname: string, href: string): boolean {
  if (href === pathname) return true;
  return pathname.startsWith(href + "/");
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname() ?? "/";

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
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
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
        <div className="hidden md:flex items-center gap-5 lg:gap-6 text-sm lg:text-base">
          {NAV_ITEMS.map((n) => {
            const active = isNavActive(pathname, n.href);
            const cls = `relative pb-1 transition-colors whitespace-nowrap ${
              active
                ? "text-esther-blue font-medium"
                : "text-ink-soft hover:text-esther-blue"
            }`;
            const underline = active ? (
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-esther-blue"
              />
            ) : null;
            return n.href.startsWith("#") ? (
              <a key={n.href} href={n.href} className={cls}>
                {n.label}
                {underline}
              </a>
            ) : (
              <Link key={n.href} href={n.href} className={cls}>
                {n.label}
                {underline}
              </Link>
            );
          })}
        </div>

        {/* Right cluster: UserMenu */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <UserMenu />
        </div>
      </div>
    </nav>
  );
}
