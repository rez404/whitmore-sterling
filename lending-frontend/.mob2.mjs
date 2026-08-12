import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
for (const path of ["/lend","/swap","/farms/NVDA","/docs","/learn"]) {
  await p.goto("http://127.0.0.1:5177" + path, { waitUntil: "networkidle" }).catch(()=>{});
  await p.waitForTimeout(2200);
  const bad = await p.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    const out = [];
    document.querySelectorAll("*").forEach((el) => {
      if (el.closest(".marquee")) return;
      // skip anything inside a scroll container that is allowed to scroll
      let a = el.parentElement, clipped = false;
      while (a) {
        const s = getComputedStyle(a);
        if (s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden") { clipped = true; break; }
        a = a.parentElement;
      }
      if (clipped) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > cw + 1) out.push({ tag: el.tagName, cls: (el.className||"").toString().slice(0,80), right: Math.round(r.right), w: Math.round(r.width), txt: (el.textContent||"").trim().slice(0,32) });
    });
    return { scrollW: document.documentElement.scrollWidth, out: out.slice(0, 10) };
  });
  console.log(`\n== ${path} scrollW=${bad.scrollW}`);
  bad.out.forEach(x => console.log(`   ${x.right} w=${x.w} <${x.tag}> "${x.txt}" | ${x.cls}`));
}
await b.close();
