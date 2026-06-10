const { BASE, newBrowser, newLoggedIn, snapText } = require("./_lib");
(async () => {
  const b = await newBrowser();
  const { ctx, page, rec, loggedIn } = await newLoggedIn(b);
  console.log("loggedIn:", loggedIn);
  for (const route of ["/m3","/m5","/m2","/m4"]) {
    await page.goto(BASE+route,{waitUntil:"domcontentloaded"});
    const t0 = (await snapText(page)).slice(0,120);           // immediate
    await page.waitForLoadState("networkidle").catch(()=>{});
    await page.waitForTimeout(3500);
    const t1 = (await snapText(page)).slice(0,160);           // settled
    console.log(`\n[${route}] guest@immediate=${t0.includes("游客模式")} guest@settled=${t1.includes("游客模式")}`);
    console.log("  settled:", t1.replace(/Offer 捕手.*?注册 /,""));
  }
  await ctx.close(); await b.close();
})();
