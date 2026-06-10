const { BASE, newBrowser, newGuest, snapText } = require("./_lib");
const RESUME = `林晓 / 计算机科学与技术 本科大四 / 复旦大学
实习:字节跳动 数据分析实习(2024.6-2024.9)—— 搭建用户行为看板,日活提升20%,用SQL+Python处理千万级日志。
项目:校园二手交易平台(2023)—— React+Node全栈,500+注册用户,负责前端与API设计。
技能:Python、SQL、React、TypeScript、数据分析、A/B测试。
社团:学生会技术部部长,组织3场百人技术沙龙。`;
(async () => {
  const b = await newBrowser();
  const { ctx, page, rec } = await newGuest(b);
  const out = [];
  const ck = (n, c, x) => out.push(`  ${c ? "✓" : "❌"} ${n}${x ? " — " + x : ""}`);
  try {
    await page.goto(BASE + "/m6/discover?mode=match-resume", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    let body = await snapText(page);
    ck("recommend tab shows inline uploader (not bounce link)", body.includes("上传你的简历") && (await page.locator("textarea").count()) > 0);
    ck("old '去上传简历' bounce gone", !body.includes("去上传简历"));
    ck("has 粘贴/上传 tabs", body.includes("粘贴文字") && body.includes("上传 PDF / Word"));
    // paste + parse
    await page.locator("textarea").first().fill(RESUME);
    await page.waitForTimeout(300);
    await page.locator('button:has-text("解析简历")').click();
    // wait for parse → UI flips to "已检测到你的简历"
    await page.waitForFunction(() => document.body.innerText.includes("已检测到你的简历"), { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(800);
    body = await snapText(page);
    ck("after parse: '已检测到你的简历' shown", body.includes("已检测到你的简历"), body.includes("林晓") ? "name 林晓 read" : "");
    ck("after parse: 推荐按钮出现", body.includes("用我的简历推荐岗位"));
    const stored = await page.evaluate(() => localStorage.getItem("parsed_resume"));
    ck("parsed resume persisted to localStorage", !!stored && stored.length > 50);
    ck("no page errors", rec.pageErrors.length === 0, rec.pageErrors[0]);
    console.log("\n### M6 INLINE UPLOAD (guest, paste path)");
    console.log(out.join("\n"));
    console.log("  console errors:", rec.consoleErrors.filter(e=>!e.includes("Failed to fetch")).slice(0,3).map(e=>e.split("\n")[0]));
  } catch (e) { console.log("ERR", e.message, e.stack); }
  finally { await ctx.close(); await b.close(); }
})();
