import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-rez-Desktop-freelance-whitmore-sterling/6ee368fd-d8f5-4197-bd0c-37a5307ec3bf/scratchpad/mob";
const W = Number(process.env.W || 390);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on("pageerror", (e) => console.log("  [pageerror]", e.message));
const PATHS = (process.env.PATHS || "/,/borrow,/lend,/swap,/farms,/farms/NVDA,/stake").split(",");
for (const path of PATHS) {
  await p.goto("http://127.0.0.1:5177" + path, { waitUntil: "networkidle" }).catch(()=>{});
  await p.waitForTimeout(2200);
  const overflow = await p.evaluate(() => {
    const de = document.documentElement;
    const bad = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
        bad.push({ tag: el.tagName, cls: (el.className||"").toString().slice(0,70), right: Math.round(r.right), txt: (el.textContent||"").trim().slice(0,30) });
      }
    });
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, bad: bad.slice(0, 8) };
  });
  console.log(`\n== ${path} w=${W} scrollW=${overflow.scrollW}/${overflow.clientW}`);
  overflow.bad.forEach(x => console.log("   OVER", x.right, x.tag, x.txt, "|", x.cls));
  await p.screenshot({ path: `${OUT}/${W}${path.replace(/\//g,"_")}.png`, fullPage: true });
}
await b.close();
