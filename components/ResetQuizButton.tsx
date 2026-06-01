"use client";

import { useRouter } from "next/navigation";
import { ReactNode } from "react";

/**
 * 重新测一次按钮 — 清 localStorage + 跳回 /m1 entry
 * 用户可以再看 entry(入口 + 测评特点 + sample),再决定是否真做
 */

type Props = {
  className?: string;
  children?: ReactNode;
};

export function ResetQuizButton({
  className = "inline-flex items-center gap-1 text-sm text-esther-blue hover:underline",
  children = "🔁 重新测一次",
}: Props) {
  const router = useRouter();

  const handleReset = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("riasec_result");
    }
    router.push("/m1");
  };

  return (
    <button onClick={handleReset} className={className}>
      {children}
    </button>
  );
}
