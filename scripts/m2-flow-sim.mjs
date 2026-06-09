// 多轮模拟 /api/m2/chat — 验逐类覆盖 / 去重 / 量化 / source_category
// 跑:node scripts/m2-flow-sim.mjs
const BASE = "http://localhost:3009";

let history = [];
let intake = { roles: [], stories: [] };
let bullets = [];

function mergeIntake(prev, d) {
  const roles = [...(prev.roles ?? [])];
  for (const r of d.delta_roles ?? []) {
    const i = roles.findIndex((x) => x.role === r.role && x.period === r.period);
    if (i >= 0) roles[i] = { ...roles[i], ...r }; else roles.push(r);
  }
  const stories = [...(prev.stories ?? [])];
  for (const s of d.delta_stories ?? []) {
    const i = stories.findIndex((x) => x.id === s.id);
    if (i >= 0) stories[i] = { ...stories[i], ...s }; else stories.push(s);
  }
  return { roles, stories };
}
function mergeBullets(prev, delta) {
  const out = [...prev];
  for (const b of delta ?? []) {
    const i = out.findIndex((x) => (b.id && x.id === b.id) || x.text === b.text);
    if (i >= 0) out[i] = { ...out[i], ...b }; else out.push(b);
  }
  return out;
}

async function turn(userText, intent) {
  if (userText) history.push({ role: "user", content: userText });
  const res = await fetch(`${BASE}/api/m2/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history, depth: "shallow", intent, current_intake: intake, current_bullets: bullets }),
  });
  const d = await res.json();
  if (d.error) { console.log("ERROR", d.error); return; }
  intake = mergeIntake(intake, d);
  bullets = mergeBullets(bullets, d.delta_bullets ?? []);
  if (d.say) history.push({ role: "assistant", content: d.say });
  console.log(`\n${userText ? "👤 " + userText : "[" + intent + "]"}`);
  console.log("🤖", (d.say || "").slice(0, 110));
  console.log("   ask:", d.ask ? `${d.ask.type}${d.ask.option_set ? "(" + d.ask.option_set + ")" : ""}` : "null", "| phase:", d.phase, "| wrap:", d.suggest_wrap);
  if ((d.delta_bullets ?? []).length)
    d.delta_bullets.forEach((b) => console.log("   + bullet id=", b.id, "[", b.competency, "/", b.sufficiency, "]:", b.text.slice(0, 50)));
}

const flow = [
  "我大学里沾过:助教/教学、校园活动。先从印象最深的那段开始挖吧。",
  "答疑解惑、出题/备课",
  "大概 30 个学生,物理课",
  "差不多了",            // ← 观察:AI 会不会主动转到「校园活动」
  "策划组织活动、上台主持",
  "迎新晚会,大概 200 人到场",
];

for (const u of flow) await turn(u);
console.log("\n===== 最终 bullets 按类目 =====");
const byCat = {};
bullets.forEach((b) => (byCat[b.source_category || "?"] ??= []).push(b.text.slice(0, 50)));
console.log(JSON.stringify(byCat, null, 2));
console.log("总 bullet 数:", bullets.length, "| 去重检查:唯一 id 数 =", new Set(bullets.map((b) => b.id)).size);
