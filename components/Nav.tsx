"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Sticky 顶部导航 — Landing v4
 * 默认透明(覆在 Hero 暖色上);滚动 > 50px 后白底 + backdrop-blur + border
 */

const NAV_ITEMS = [
  { label: "能陪你做的事", href: "#modules" },
  { label: "真实案例", href: "#case" },
  { label: "关于不二", href: "#buer-section" },
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
        <div className="hidden md:flex items-center gap-10 text-base text-ink-soft">
          {NAV_ITEMS.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="hover:text-esther-blue transition-colors"
            >
              {n.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <Link
          href="#persona"
          className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors flex-shrink-0 shadow-sm"
        >
          开始使用 →
        </Link>
      </div>
    </nav>
  );
}
