const { BASE, newBrowser, newLoggedIn } = require("./_lib");
async function guestAt(page){ try{ return (await page.locator("body").innerText({timeout:800})).includes("游客模式"); }catch{ return null; } }
(async () => {
  const b = await newBrowser();
  const { ctx, page, loggedIn } = await newLoggedIn(b);
  console.log("loggedIn:", loggedIn);
  for (const route of ["/m3","/m5","/m2","/m4"]) {
    await page.goto(BASE+route,{waitUntil:"commit"});
    const samples=[];
    for (let i=0;i<12;i++){ samples.push(await guestAt(page)? "G":"."); await page.waitForTimeout(250); }
    // approx ms when guest banner disappears
    console.log(`[${route}] timeline(250ms each):`, samples.join(""));
  }
  await ctx.close(); await b.close();
})();
