import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { clearLocalUserData } from "./use-local-state";

/**
 * 还原真实 localStorage 行为的关键:方法挂在原型上,
 * 这样 setItem 写入的数据键是实例 own enumerable 属性,
 * Object.keys(instance) 只返回数据键(不含方法名)——和浏览器一致。
 */
class LocalStorageMock {
  getItem(k: string): string | null {
    return Object.prototype.hasOwnProperty.call(this, k)
      ? (this as unknown as Record<string, string>)[k]
      : null;
  }
  setItem(k: string, v: string): void {
    (this as unknown as Record<string, string>)[k] = String(v);
  }
  removeItem(k: string): void {
    delete (this as unknown as Record<string, string>)[k];
  }
}

describe("clearLocalUserData — 登出隐私清理", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      localStorage: new LocalStorageMock(),
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  const ls = () =>
    (globalThis as { window: { localStorage: LocalStorageMock } }).window
      .localStorage;

  it("清掉所有个人数据键(固定键 / 模块前缀 / 动态会话键 / M5 非前缀键)", () => {
    const personal = [
      "parsed_resume", // STORAGE_KEYS 固定
      "final_resume",
      "riasec_result",
      "discover_match_meta", // discover_ 前缀 + STORAGE_KEYS
      "discover_recommended_jobs",
      "m1_quiz_draft", // m1_ 前缀(不在 STORAGE_KEYS)
      "m3_decisions_conv-abc", // 动态会话键
      "m3_edits_conv-abc_sig123",
      "m5_live_progress", // m5_ 前缀
      "from_debrief_highlight", // M5_STORAGE_KEYS,无前缀
      "interview_session_config", // M5_STORAGE_KEYS,无前缀
      "buer_diary_entries", // buer_ 前缀:日记正文(强隐私)
      "buer_diary_consent",
      "buer_session_id",
      "tracker_applications_v1", // tracker_ 前缀:投递记录(强隐私)
      "intake_artifact", // STORAGE_KEYS.M2_INTAKE
      "data_migrated_at", // PERSONAL_EXACT_KEYS:迁移哨兵
    ];
    for (const k of personal) ls().setItem(k, "secret");

    clearLocalUserData();

    for (const k of personal) {
      expect(ls().getItem(k), `${k} 应被清除`).toBeNull();
    }
  });

  it("保留与个人无关的键(UI 偏好 / Supabase 鉴权 / 第三方)", () => {
    const keep = [
      "conv_sidebar_collapsed", // UI 偏好
      "sb-xyzproject-auth-token", // Supabase 鉴权(signOut 自己处理)
      "theme",
      "cookie_consent",
    ];
    for (const k of keep) ls().setItem(k, "ok");
    // 同时放一个个人键,确认清理确实跑了
    ls().setItem("parsed_resume", "secret");

    clearLocalUserData();

    expect(ls().getItem("parsed_resume")).toBeNull();
    for (const k of keep) {
      expect(ls().getItem(k), `${k} 应被保留`).toBe("ok");
    }
  });

  it("SSR(无 window)安全:不抛错", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => clearLocalUserData()).not.toThrow();
  });
});
