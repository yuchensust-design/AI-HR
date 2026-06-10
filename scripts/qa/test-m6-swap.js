const { BASE, newBrowser, newGuest, snapText } = require("./_lib");
function sig(r){ if(!r) return ""; const s=JSON.stringify(r); let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); }
const RESUME_A = { basic: { name: "旧简历甲" }, skills: ["Java"] };
const RESUME_B = `林晓 / 计算机科学 本科大四 / 复旦大学
实习:字节跳动 数据分析实习,搭建用户行为看板,日活提升20%,SQL+Python处理千万级日志。
项目:校园二手交易平台,React+Node全栈,500+用户。技能:Python、SQL、React、数据分析。`;
const longMd = "## 旧简历甲\n后端工程师。Java/Spring。三段实习。多个项目。技能丰富。".repeat(4);
(async () => {
  const b = await newBrowser();
  const { ctx, page, rec } = await newGuest(b);
  const out = []; const ck = (n, c, x) => out.push(`  ${c ? "✓" : "❌"} ${n}${x ? " — " + x : ""}`);
  try {
    await page.goto(BASE + "/m6/discover", { waitUntil: "networkidle" });
    // seed: 已有简历甲 + 推荐缓存 + 对应签名(模拟"已推荐过")
    await page.evaluate(([md, A, sigA]) => {
      localStorage.setItem("parsed_resume", JSON.stringify(A));
      localStorage.setItem("final_resume", JSON.stringify({ markdown: md }));
      localStorage.setItem("discover_tab", JSON.stringify("recommend"));
      localStorage.setItem("discover_recommended_jobs", JSON.stringify([{ id: "old1", title: "旧推荐岗位X", company: "甲", city: "上海", platform: "51job", jdUrl: "https://e.com/x", matchScore: 80 }]));
      localStorage.setItem("discover_match_meta", JSON.stringify({ keywords: ["Java"] }));
      localStorage.setItem("discover_recommend_sig", JSON.stringify(sigA));
    }, [longMd, RESUME_A, sig(RESUME_A)]);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    let body = await snapText(page);
    ck("has-resume: shows 旧简历甲", body.includes("已检测到你的简历") && body.includes("旧简历甲"));
    ck("has-resume: 推荐按钮在", body.includes("用我的简历推荐岗位"));
    ck("has-resume: 换简历入口在", body.includes("换一份") || body.includes("重新上传简历"));
    ck("has-resume: 旧推荐卡片在(换之前)", body.includes("旧推荐岗位X"));
    await page.locator('button:has-text("换一份")').click();
    await page.waitForTimeout(500);
    ck("swap opened: uploader textarea appears", (await page.locator("textarea").count()) > 0);
    await page.locator("textarea").first().fill(RESUME_B);
    await page.locator('button:has-text("解析简历")').click();
    await page.waitForFunction(() => !document.body.innerText.includes("旧简历甲"), { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    body = await snapText(page);
    ck("after swap: 旧简历甲 已替换", !body.includes("旧简历甲"));
    ck("after swap: 新名字(林晓)出现", body.includes("林晓"));
    ck("after swap: 旧推荐缓存失效(卡片清 + 提示)", !body.includes("旧推荐岗位X") && body.includes("检测到你的简历有更新"));
    ck("no page errors", rec.pageErrors.length === 0, rec.pageErrors[0]);
    console.log("\n### M6 SWAP RESUME (guest, has-resume → 换一份)");
    console.log(out.join("\n"));
  } catch (e) { console.log("ERR", e.message, e.stack); }
  finally { await ctx.close(); await b.close(); }
})();
