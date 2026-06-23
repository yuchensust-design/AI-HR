/**
 * 直播演示账号「林舟」种数据脚本(仅操作该账号自己的行,用 service key 绕过 RLS)
 * 运行:在 offer-catcher-web 下  node scripts/seed-demo.mjs
 *
 * 林舟登录凭据(演示时用):
 *   邮箱: linzhou.demo@offercatcher.app
 *   密码: Linzhou2026!
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// 读 .env.local 拿 url + service key
const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;
if (!URL || !SECRET) { console.error("缺 SUPABASE url / secret key"); process.exit(1); }

export const DEMO_EMAIL = "linzhou.demo@offercatcher.app";
const DEMO_PASSWORD = "Linzhou2026!";

const sb = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

async function ensureUser() {
  // 找已存在的
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list?.users?.find((u) => u.email === DEMO_EMAIL);
  if (found) { console.log("账号已存在:", found.id); return found.id; }
  const { data, error } = await sb.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "林舟" },
  });
  if (error) { console.error("建账号失败:", error.message); process.exit(1); }
  console.log("已建账号:", data.user.id);
  return data.user.id;
}

async function main() {
  const uid = await ensureUser();

  // profile
  {
    const { error } = await sb.from("profiles").upsert({ user_id: uid, display_name: "林舟", persona_tag: "explorer" });
    console.log("profiles:", error ? "ERR " + error.message : "ok");
  }

  // m1 测评(理想三档)
  {
    const m1 = JSON.parse(fs.readFileSync(path.join("lib", "demo", "linzhou-m1.json"), "utf8"));
    const { error } = await sb.from("m1_assessments").upsert({
      user_id: uid,
      riasec_json: { scores: m1.scores, code: m1.code, confidence: m1.confidence },
      recommendation_json: {
        positive: m1.positive,
        negative: m1.negative,
        refine_chips: m1.refine_chips,
        rationale: m1.rationale,
        evidence: { source: "resume", summary: "信管大三 · 增长实习 · 拾光小程序 · AI 学习助手", tags: ["产品", "用户增长", "数据分析", "AI"] },
        disclaimer: m1.disclaimer,
      },
      completed_at: new Date().toISOString(),
    });
    console.log("m1_assessments:", error ? "ERR " + error.message : "ok");
  }

  // m3 基础简历会话(m6 推荐 / m3 优化 / m4 入口都读它;也是回流的 session B「补之前」)
  {
    const parsed = JSON.parse(fs.readFileSync(path.join("lib", "demo", "linzhou-m3-parsed.json"), "utf8"));
    const jdctx = JSON.parse(fs.readFileSync(path.join("lib", "demo", "linzhou-m3-jdctx.json"), "utf8"));
    const CONV_ID = "0a1b2c3d-0000-4000-8000-00000000a3b1";
    // 一键重置:删林舟所有会话(m2/m3/m4/m5,子表 ON DELETE CASCADE 自动清),再插基础简历会话
    // 演示前重跑本脚本即可把账号恢复到干净起点
    await sb.from("conversations").delete().eq("user_id", uid);
    const { error: cErr } = await sb.from("conversations").insert({
      id: CONV_ID,
      user_id: uid,
      module: "m3",
      title: "AI 产品经理实习 · 简历优化",
    });
    const { error: rErr } = await sb.from("m3_resumes").upsert({
      conversation_id: CONV_ID,
      parsed_resume_json: parsed,
      jd_context_json: jdctx,
    });
    console.log("m3 会话:", cErr || rErr ? "ERR " + (cErr?.message || rErr?.message) : "ok (" + CONV_ID + ")");
  }

  console.log("\n✅ 种数据完成。登录:", DEMO_EMAIL, "/", DEMO_PASSWORD);
}
main();
